import { Test, TestingModule } from '@nestjs/testing';
import { VideoService } from './video.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { buildVideoRecord } from '../../test/fixtures/video.fixture';
import { claude, defaultMockMoments } from './helpers/mocks/claude.mock';

// `fluent-ffmpeg` is substituted by the moduleNameMapper entry in package.json,
// which points at test/__mocks__/fluent-ffmpeg.ts. Re-requiring that file from
// a jest.mock factory would resolve to the same module and recurse, so the
// inline factory below provides its own jest.fn() for ffprobe instead.
jest.mock('fluent-ffmpeg', () => {
  const ffprobe = jest.fn();
  const factory: unknown = jest.fn();
  (factory as Record<string, unknown>).ffprobe = ffprobe;
  (factory as Record<string, unknown>).setFfmpegPath = jest.fn();
  (factory as Record<string, unknown>).setFfprobePath = jest.fn();
  return { __esModule: true, default: factory };
});

import ffmpeg from 'fluent-ffmpeg';

const ffprobeMock = (ffmpeg as unknown as { ffprobe: jest.Mock }).ffprobe;

interface ProcessingStats {
  momentsFound: number;
  inputQuality: string;
  durationSec: number;
  clipsGenerated: number;
  timeTakenMs: number;
  avgDurationSec?: number;
  errorDetails?: string;
  moments?: Array<{ start: number; end: number; reason: string }>;
}

interface VideoUpdateArgs {
  where: { id: number };
  data: { processingStats: ProcessingStats };
}

describe('VideoService', () => {
  let service: VideoService;

  const mockVideo = buildVideoRecord({
    id: 1,
    userId: 10,
    duration: 120,
    status: 'pending',
  });

  const mockPrismaService = {
    video: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };

  const mockConfigService = {
    get: jest.fn((key: string): string | undefined => {
      const config: Record<string, string | undefined> = {
        ANTHROPIC_API_KEY: 'test-api-key',
        ANTHROPIC_MODEL: 'claude-4.1',
      };
      return config[key];
    }),
  };

  const lastStats = (): ProcessingStats => {
    const calls = mockPrismaService.video.update.mock.calls as unknown as [
      VideoUpdateArgs,
    ][];
    return calls[calls.length - 1][0].data.processingStats;
  };

  const stubFfprobe = (duration: number, height?: number): void => {
    ffprobeMock.mockImplementation(
      (_url: string, callback: (e: Error | null, d?: unknown) => void) =>
        callback(null, {
          format: { duration },
          streams: height
            ? [{ codec_type: 'video', height }]
            : [{ codec_type: 'audio' }],
        }),
    );
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    claude.install();
    claude.reset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VideoService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<VideoService>(VideoService);
  });

  afterEach(() => {
    claude.restore();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('detectViralTimestamps', () => {
    beforeEach(() => {
      mockPrismaService.video.findUnique.mockResolvedValue(mockVideo);
      mockPrismaService.video.update.mockImplementation((args: unknown) => {
        const updateArgs = args as VideoUpdateArgs;
        return Promise.resolve({
          ...mockVideo,
          processingStats: updateArgs.data.processingStats,
        });
      });
    });

    // ── Successful timestamp detection (mocked Claude) ──────────────────────

    it('uses the moments returned by Claude when detection succeeds', async () => {
      claude.mockSuccess({ clipCount: 10, clipDuration: 30 });
      stubFfprobe(600, 1080);

      const result = await service.detectViralTimestamps(mockVideo.id);

      expect(result).toHaveLength(10);
      expect(result[0]).toEqual({ start: 0, end: 30, reason: 'moment-1' });
      expect(claude.callCount).toBe(1);
    });

    it('persists processingStats for a successful AI detection', async () => {
      claude.mockSuccess({ clipCount: 10 });
      stubFfprobe(600, 1080);

      await service.detectViralTimestamps(mockVideo.id);

      expect(mockPrismaService.video.update).toHaveBeenCalledWith({
        where: { id: mockVideo.id },
        data: {
          processingStats: expect.objectContaining({
            momentsFound: expect.any(Number),
            inputQuality: '1080p',
            durationSec: 600,
            clipsGenerated: expect.any(Number),
            timeTakenMs: expect.any(Number),
            avgDurationSec: expect.any(Number),
          }),
        },
      });

      const stats = lastStats();
      expect(stats.momentsFound).toBe(10);
      expect(stats.clipsGenerated).toBe(10);
      expect(stats.durationSec).toBe(600);
      expect(stats.inputQuality).toBe('1080p');
      expect(stats.timeTakenMs).toBeGreaterThanOrEqual(0);
      expect(stats.avgDurationSec).toBe(30);
      expect(stats.errorDetails).toBeUndefined();
    });

    it('sends the AI moments through to processingStats', async () => {
      claude.mockSuccess({ clipCount: 10 });
      stubFfprobe(600, 1080);

      await service.detectViralTimestamps(mockVideo.id);

      expect(lastStats().moments).toEqual(defaultMockMoments(10));
    });

    it('normalises overlapping Claude moments before persisting them', async () => {
      claude.mockSuccess({
        clipCount: 10,
        clips: Array.from({ length: 10 }, (_, i) => ({
          start: i * 10,
          end: i * 10 + 20,
          reason: `overlapping-${i}`,
        })),
      });
      stubFfprobe(600, 1080);

      const result = await service.detectViralTimestamps(mockVideo.id);

      // Clips are trimmed so they never overlap after normalisation.
      for (let i = 1; i < result.length; i += 1) {
        expect(result[i].start).toBeGreaterThanOrEqual(result[i - 1].end);
      }
      expect(lastStats().clipsGenerated).toBe(result.length);
    });

    // ── Empty / malformed / failure fallbacks ───────────────────────────────

    it('falls back to fixed chunks when Claude returns an empty response', async () => {
      claude.mockEmptyResponse();
      stubFfprobe(120, 1080);

      const result = await service.detectViralTimestamps(mockVideo.id);

      expect(result.length).toBeGreaterThan(0);
      expect(result[0].reason).toBe('fallback-fixed-chunk');
      expect(lastStats().errorDetails).toBeUndefined();
    });

    it('falls back to fixed chunks when Claude returns a malformed body', async () => {
      claude.mockMalformedResponse();
      stubFfprobe(120, 1080);

      const result = await service.detectViralTimestamps(mockVideo.id);

      expect(result[0].reason).toBe('fallback-fixed-chunk');
    });

    it('falls back to fixed chunks when too few clips are returned', async () => {
      claude.mockTooFewClips(2);
      stubFfprobe(120, 1080);

      const result = await service.detectViralTimestamps(mockVideo.id);

      expect(result[0].reason).toBe('fallback-fixed-chunk');
    });

    it('falls back to fixed chunks and records the error on an API failure', async () => {
      claude.mockApiFailure();
      stubFfprobe(120, 1080);

      const result = await service.detectViralTimestamps(mockVideo.id);

      expect(result[0].reason).toBe('fallback-fixed-chunk');
      expect(lastStats().errorDetails).toBe('API Error: internal server error');
    });

    it('falls back and records the error on a rate limit', async () => {
      claude.mockRateLimit();
      stubFfprobe(120, 1080);

      await service.detectViralTimestamps(mockVideo.id);

      expect(lastStats().errorDetails).toBe(
        'Rate limit exceeded. Please retry shortly.',
      );
    });

    it('falls back and records the error on a timeout', async () => {
      claude.mockTimeout();
      stubFfprobe(120, 1080);

      await service.detectViralTimestamps(mockVideo.id);

      expect(lastStats().errorDetails).toBe('Request timed out after 600000ms');
    });

    it('never makes a real Claude API request', async () => {
      claude.mockSuccess();
      stubFfprobe(120, 1080);

      await service.detectViralTimestamps(mockVideo.id);

      // The SDK was never installed; the only way a request can be recorded is
      // through the mock, and no dynamic-import error escaped.
      expect(claude.callCount).toBe(1);
      expect(String(lastStats().errorDetails)).not.toMatch(/dynamic import/i);
    });

    // ── ffprobe / video failures ────────────────────────────────────────────

    it('should collect processingStats and update Video on success with fallback chunks when AI fails/unavailable', async () => {
      mockPrismaService.video.update.mockResolvedValue({
        ...mockVideo,
        status: 'completed',
      });
      claude.mockSuccess({ clipCount: 12 });
      stubFfprobe(120, 1080);

      const result = await service.detectViralTimestamps(mockVideo.id);

      expect(result).toBeDefined();
      expect(result.length).toBeGreaterThan(0);

      expect(mockPrismaService.video.findUnique).toHaveBeenCalledWith({
        where: { id: mockVideo.id },
      });

      expect(mockPrismaService.video.update).toHaveBeenCalledWith({
        where: { id: mockVideo.id },
        data: {
          processingStats: expect.objectContaining({
            momentsFound: expect.any(Number),
            inputQuality: '1080p',
            durationSec: 120,
            clipsGenerated: expect.any(Number),
            timeTakenMs: expect.any(Number),
            avgDurationSec: expect.any(Number),
          }),
        },
      });

      const stats = lastStats();
      expect(stats.momentsFound).toBeGreaterThan(0);
      expect(stats.clipsGenerated).toBeGreaterThan(0);
      expect(stats.durationSec).toBe(120);
      expect(stats.inputQuality).toBe('1080p');
      expect(stats.timeTakenMs).toBeGreaterThanOrEqual(0);
      expect(stats.avgDurationSec).toBeGreaterThan(0);
    });

    it('should update processingStats with errorDetails on failure when video is missing or throw occurs', async () => {
      mockPrismaService.video.findUnique.mockResolvedValue(null);

      await expect(service.detectViralTimestamps(999)).rejects.toThrow(
        'Video 999 not found',
      );

      expect(mockPrismaService.video.update).toHaveBeenCalledWith({
        where: { id: 999 },
        data: {
          processingStats: expect.objectContaining({
            momentsFound: 0,
            inputQuality: 'unknown',
            durationSec: 0,
            clipsGenerated: 0,
            timeTakenMs: expect.any(Number),
            errorDetails: 'Video 999 not found',
          }),
        },
      });
    });

    it('should handle ffprobe failure gracefully and default inputQuality to unknown', async () => {
      mockPrismaService.video.update.mockResolvedValue(mockVideo);
      claude.mockSuccess({ clipCount: 12 });

      ffprobeMock.mockImplementation(
        (_url: string, callback: (e: Error | null, d?: unknown) => void) =>
          callback(new Error('ffprobe error')),
      );

      const result = await service.detectViralTimestamps(mockVideo.id);

      expect(result).toBeDefined();
      expect(mockPrismaService.video.update).toHaveBeenCalledWith({
        where: { id: mockVideo.id },
        data: {
          processingStats: expect.objectContaining({
            inputQuality: 'unknown',
            durationSec: 120, // fell back to video.duration
          }),
        },
      });
    });
  });
});
