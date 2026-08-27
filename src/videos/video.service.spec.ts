import { Test, TestingModule } from '@nestjs/testing';
import { VideoService } from './video.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';

// Mock fluent-ffmpeg
jest.mock('fluent-ffmpeg', () => require('../../test/__mocks__/fluent-ffmpeg'));
import ffmpeg from 'fluent-ffmpeg';

describe('VideoService', () => {
  let service: VideoService;
  let prismaService: PrismaService;

  const mockVideo = {
    id: 1,
    userId: 10,
    title: 'Test Video',
    sourceUrl: 'https://example.com/test.mp4',
    duration: 120,
    status: 'pending',
  };

  const mockPrismaService = {
    video: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };

  const mockConfigService = {
    get: jest.fn((key: string) => {
      const config: Record<string, any> = {
        ANTHROPIC_API_KEY: 'test-api-key',
        ANTHROPIC_MODEL: 'claude-4.1',
      };
      return config[key];
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VideoService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<VideoService>(VideoService);
    prismaService = module.get<PrismaService>(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('detectViralTimestamps', () => {
    it('should collect processingStats and update Video on success with fallback chunks when AI fails/unavailable', async () => {
      mockPrismaService.video.findUnique.mockResolvedValue(mockVideo);
      mockPrismaService.video.update.mockResolvedValue({
        ...mockVideo,
        status: 'completed',
      });

      // Mock ffprobe metadata
      (ffmpeg.ffprobe as unknown as jest.Mock).mockImplementation(
        (url: string, callback: Function) => {
          callback(null, {
            format: { duration: 120 },
            streams: [{ codec_type: 'video', height: 1080 }],
          });
        },
      );

      // Call detectViralTimestamps (will use fallback chunks since dynamic import of anthropic fails in test environment)
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

      const updateCallArg = mockPrismaService.video.update.mock.calls[0][0];
      const stats = updateCallArg.data.processingStats;
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
            errorDetails: 'Error: Video 999 not found',
          }),
        },
      });
    });

    it('should handle ffprobe failure gracefully and default inputQuality to unknown', async () => {
      mockPrismaService.video.findUnique.mockResolvedValue(mockVideo);
      mockPrismaService.video.update.mockResolvedValue(mockVideo);

      (ffmpeg.ffprobe as unknown as jest.Mock).mockImplementation(
        (url: string, callback: Function) => {
          callback(new Error('ffprobe error'));
        },
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
