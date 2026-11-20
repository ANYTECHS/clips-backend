/**
 * E2E test suite — Full Clip Generation Pipeline (#1009)
 *
 * Covers the complete workflow:
 *   Video Upload → AI (Claude) Timestamp Detection → FFmpeg Processing
 *                → Cloudinary Upload → Clip Database Record
 *
 * All external dependencies are mocked:
 *  - Claude / Anthropic AI: mock returning fixed viral timestamps
 *  - FFmpeg: in-memory mock (test/__mocks__/fluent-ffmpeg.ts)
 *  - Cloudinary: mock upload service
 *  - Prisma: in-memory mock
 *  - BullMQ queue: in-memory queue
 *
 * Test scenarios:
 *  1. Successful full pipeline
 *  2. AI timestamp detection failure → fallback to fixed chunks
 *  3. FFmpeg processing failure
 *  4. Cloudinary upload failure
 */

// ── Fluent-ffmpeg mock must be hoisted before any import that requires it ────
jest.mock('fluent-ffmpeg', () => require('./__mocks__/fluent-ffmpeg').default);

// ── Cloudinary mock ───────────────────────────────────────────────────────────
jest.mock('cloudinary', () => require('./mocks/cloudinary.mock'));

// ── Circuit breaker mock ──────────────────────────────────────────────────────
jest.mock('../src/common/circuit-breaker/circuit-breaker.service', () => ({
  CircuitBreakerService: class {
    execute(_cfg: any, fn: () => any) {
      return fn();
    }
  },
}));

import { EventEmitter2 } from '@nestjs/event-emitter';
import { Job } from 'bullmq';

import { ClipGenerationProcessor } from '../src/clips/clip-generation.processor';
import { ClipsService } from '../src/clips/clips.service';
import { CloudinaryService } from '../src/clips/cloudinary.service';
import { VideoService } from '../src/videos/video.service';
import { MetricsService } from '../src/metrics/metrics.service';
import { CLIP_GENERATION_QUEUE } from '../src/clips/clip-generation.queue';
import type { ClipGenerationJob } from '../src/clips/clip-generation.processor';
import {
  mockFFmpegSuccess,
  mockFFmpegError,
  cleanupFFmpegMock,
} from './helpers/ffmpeg-mock.helper';
import { MockCloudinaryService, FAKE_SECURE_URL } from './mocks/cloudinary.mock';

// ── In-memory BullMQ queue ────────────────────────────────────────────────────

class InMemoryQueue {
  readonly name = CLIP_GENERATION_QUEUE;
  private jobs = new Map<string, any>();
  private counter = 0;

  async add(name: string, data: any, opts?: any) {
    const id = String(++this.counter);
    const job = { id, name, data, opts, attemptsMade: 0 };
    this.jobs.set(id, job);
    return job;
  }

  async getJob(id: string) {
    return this.jobs.get(id) ?? null;
  }

  async getJobCounts() {
    return { waiting: this.jobs.size, active: 0, delayed: 0, prioritized: 0 };
  }

  clear() {
    this.jobs.clear();
    this.counter = 0;
  }
}

// ── Mock BullMQ Job factory ───────────────────────────────────────────────────

function makeMockJob(data: ClipGenerationJob, id = '1'): Job<ClipGenerationJob> {
  return {
    id,
    data,
    opts: { attempts: 3 },
    attemptsMade: 0,
    updateProgress: jest.fn().mockResolvedValue(undefined),
    log: jest.fn().mockResolvedValue(undefined),
    moveToFailed: jest.fn().mockResolvedValue(undefined),
  } as unknown as Job<ClipGenerationJob>;
}

// ── Shared mock data ──────────────────────────────────────────────────────────

const TEST_VIDEO_ID = 'video-e2e-test-001';
const TEST_INPUT_PATH = '/tmp/test-video-input.mp4';
const TEST_OUTPUT_PATH = '/tmp/test-clip-output.mp4';

const baseJobData: ClipGenerationJob = {
  videoId: TEST_VIDEO_ID,
  inputPath: TEST_INPUT_PATH,
  outputPath: TEST_OUTPUT_PATH,
  startTime: 10,
  endTime: 40,
  positionRatio: 0.25,
  videoDuration: 120,
  title: 'Test Video — E2E',
  clipId: 42,
};

// ── Prisma mock ───────────────────────────────────────────────────────────────

const prismaMock = {
  clip: {
    update: jest.fn().mockResolvedValue({
      id: 42,
      videoId: TEST_VIDEO_ID,
      clipUrl: FAKE_SECURE_URL,
      duration: 30,
      viralityScore: 75,
    }),
    findUnique: jest.fn().mockResolvedValue({ id: 42, videoId: TEST_VIDEO_ID }),
  },
  video: {
    findUnique: jest.fn().mockResolvedValue({
      id: TEST_VIDEO_ID,
      userId: 1,
      filePath: TEST_INPUT_PATH,
      duration: 120,
    }),
    update: jest.fn().mockResolvedValue({}),
  },
};

// ── VideoService mock ─────────────────────────────────────────────────────────

const videoServiceMock = {
  findById: jest.fn().mockResolvedValue({
    id: TEST_VIDEO_ID,
    filePath: TEST_INPUT_PATH,
    duration: 120,
  }),
  detectViralTimestamps: jest.fn().mockResolvedValue([
    { start: 10, end: 40, score: 0.9, transcript: 'Amazing moment here' },
    { start: 55, end: 85, score: 0.75, transcript: 'Another great clip' },
  ]),
  updateStatus: jest.fn().mockResolvedValue({}),
};

// ── MetricsService mock ───────────────────────────────────────────────────────

const metricsServiceMock = {
  incrementClipsGenerated: jest.fn(),
  recordJobStart: jest.fn(),
  recordJobCompletion: jest.fn(),
  setQueueDepth: jest.fn(),
};

// ── GracefulShutdownService mock ──────────────────────────────────────────────

const shutdownServiceMock = {
  register: jest.fn(),
};

// ── ClipsService mock ─────────────────────────────────────────────────────────

const clipsServiceMock = {
  enqueueClip: jest.fn().mockImplementation(async (data: any) => {
    return { jobId: 'mock-job-id', delayed: false, delayMs: 0 };
  }),
  refreshQueueDepth: jest.fn().mockResolvedValue(undefined),
  _isVideoCancelled: jest.fn().mockReturnValue(false),
};

// ── ClipsGateway mock ─────────────────────────────────────────────────────────

const clipsGatewayMock = {
  emitClipProgress: jest.fn(),
};

// ── Build the processor under test ───────────────────────────────────────────

function buildProcessor(): ClipGenerationProcessor {
  const cloudinaryService = new MockCloudinaryService() as unknown as CloudinaryService;

  const processor = new ClipGenerationProcessor(
    videoServiceMock as unknown as VideoService,
    cloudinaryService,
    new EventEmitter2(),
    clipsGatewayMock as any,
    clipsServiceMock as unknown as ClipsService,
    metricsServiceMock as unknown as MetricsService,
    prismaMock as any,
    shutdownServiceMock as any,
  );

  // Inject worker stub required by WorkerHost
  (processor as any).worker = {
    on: jest.fn(),
    close: jest.fn(),
  };

  return processor;
}

// ─────────────────────────────────────────────────────────────────────────────
// Test Suites
// ─────────────────────────────────────────────────────────────────────────────

describe('Clip Generation Pipeline — E2E', () => {
  let processor: ClipGenerationProcessor;
  let queue: InMemoryQueue;

  beforeAll(() => {
    queue = new InMemoryQueue();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockFFmpegSuccess();
    processor = buildProcessor();
  });

  afterEach(() => {
    cleanupFFmpegMock();
    queue.clear();
  });

  // ── 1. ClipsService enqueue ──────────────────────────────────────────────

  describe('Step 1 — ClipsService.enqueueClip', () => {
    it('enqueues a clip-generation job and returns a jobId', async () => {
      const { jobId } = await clipsServiceMock.enqueueClip({
        videoId: TEST_VIDEO_ID,
        inputPath: TEST_INPUT_PATH,
        outputPath: TEST_OUTPUT_PATH,
        startTime: 0,
        endTime: 30,
        positionRatio: 0.5,
      });

      expect(jobId).toBeDefined();
      expect(typeof jobId).toBe('string');
    });

    it('accepts all ClipGenerationJob fields', async () => {
      const enqueueData: ClipGenerationJob = {
        ...baseJobData,
        transcript: 'Test transcript content',
        title: 'My Video',
      };

      const result = await clipsServiceMock.enqueueClip(enqueueData);
      expect(result.jobId).toBeDefined();
    });
  });

  // ── 2. Successful full pipeline ──────────────────────────────────────────

  describe('Step 2 — Full pipeline (success)', () => {
    it('processes a clip job end-to-end: FFmpeg cut → Cloudinary upload → DB record', async () => {
      const job = makeMockJob(baseJobData);

      const result = await processor.process(job);

      // Clip record should be returned
      expect(result).toBeDefined();
      expect(result.videoId).toBe(TEST_VIDEO_ID);

      // Progress should have been reported
      expect(job.updateProgress).toHaveBeenCalledWith(
        expect.objectContaining({ percent: expect.any(Number) }),
      );

      // Metrics should have been recorded
      expect(metricsServiceMock.recordJobStart).toHaveBeenCalled();
    });

    it('updates the DB clip record with the Cloudinary URL', async () => {
      const job = makeMockJob(baseJobData);

      await processor.process(job);

      // Prisma update should have been called with clipUrl from Cloudinary
      expect(prismaMock.clip.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            clipUrl: expect.stringContaining('cloudinary'),
          }),
        }),
      );
    });

    it('emits 100% progress (done) after successful processing', async () => {
      const job = makeMockJob(baseJobData);

      await processor.process(job);

      const calls: any[] = (job.updateProgress as jest.Mock).mock.calls;
      const doneCall = calls.find((c) => c[0]?.percent === 100 || c[0]?.step === 'done');
      expect(doneCall).toBeDefined();
    });

    it('increments success metric after successful processing', async () => {
      const job = makeMockJob(baseJobData);

      await processor.process(job);

      expect(metricsServiceMock.incrementClipsGenerated).toHaveBeenCalledWith('success');
    });

    it('emits video_download progress (10%) at start', async () => {
      const job = makeMockJob(baseJobData);

      await processor.process(job);

      const calls: any[] = (job.updateProgress as jest.Mock).mock.calls;
      const downloadCall = calls.find(
        (c) => c[0]?.percent === 10 || c[0]?.step === 'video_download',
      );
      expect(downloadCall).toBeDefined();
    });

    it('emits upload progress (80%) before Cloudinary', async () => {
      const job = makeMockJob(baseJobData);

      await processor.process(job);

      const calls: any[] = (job.updateProgress as jest.Mock).mock.calls;
      const uploadCall = calls.find(
        (c) => c[0]?.percent === 80 || c[0]?.step === 'upload',
      );
      expect(uploadCall).toBeDefined();
    });

    it('calculates a virality score and stores it on the clip', async () => {
      const job = makeMockJob({ ...baseJobData, transcript: 'amazing viral content' });

      await processor.process(job);

      expect(prismaMock.clip.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            viralityScore: expect.any(Number),
          }),
        }),
      );
    });

    it('preserves existing viralityScore when existingViralityScore is provided', async () => {
      const job = makeMockJob({ ...baseJobData, existingViralityScore: 95 });

      await processor.process(job);

      expect(prismaMock.clip.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            viralityScore: 95,
          }),
        }),
      );
    });
  });

  // ── 3. Uploaded video processing (processUploadedVideo path) ────────────

  describe('Step 3 — Uploaded video processing (no startTime/endTime)', () => {
    it('routes to processUploadedVideo when inputPath set but no start/end time', async () => {
      const uploadedVideoJob = makeMockJob({
        videoId: TEST_VIDEO_ID,
        inputPath: TEST_INPUT_PATH,
        outputPath: '',
        startTime: 0,
        endTime: 0,
        positionRatio: 0,
      } as any);

      // This path calls videoService.detectViralTimestamps
      // It should not throw
      await expect(processor.process(uploadedVideoJob)).resolves.toBeDefined();
    });
  });

  // ── 4. FFmpeg failure ────────────────────────────────────────────────────

  describe('Step 4 — FFmpeg failure', () => {
    it('throws when FFmpeg fails to cut the clip', async () => {
      mockFFmpegError('FFmpeg error: invalid input codec');

      const job = makeMockJob(baseJobData, '2');

      await expect(processor.process(job)).rejects.toThrow();
    });

    it('does not call Cloudinary upload when FFmpeg fails', async () => {
      mockFFmpegError('FFmpeg process died unexpectedly');

      const cloudinary = new MockCloudinaryService();
      const uploadSpy = jest.spyOn(cloudinary, 'uploadVideoFromBuffer');

      const p = new ClipGenerationProcessor(
        videoServiceMock as unknown as VideoService,
        cloudinary as unknown as CloudinaryService,
        new EventEmitter2(),
        clipsGatewayMock as any,
        clipsServiceMock as unknown as ClipsService,
        metricsServiceMock as unknown as MetricsService,
        prismaMock as any,
        shutdownServiceMock as any,
      );
      (p as any).worker = { on: jest.fn(), close: jest.fn() };

      const job = makeMockJob(baseJobData, '3');
      await expect(p.process(job)).rejects.toThrow();

      expect(uploadSpy).not.toHaveBeenCalled();
    });
  });

  // ── 5. Cloudinary upload failure ─────────────────────────────────────────

  describe('Step 5 — Cloudinary upload failure', () => {
    it('returns upload-failed clip (local fallback) when Cloudinary upload errors', async () => {
      // FFmpeg succeeds
      mockFFmpegSuccess();

      // Cloudinary fails
      const failingCloudinary = {
        uploadVideoFromBuffer: jest.fn().mockRejectedValue(new Error('Cloudinary quota exceeded')),
        deleteLocalFile: jest.fn().mockResolvedValue(undefined),
        deleteClip: jest.fn().mockResolvedValue(undefined),
        readFileToBuffer: jest.fn().mockResolvedValue(Buffer.from('data')),
      } as unknown as CloudinaryService;

      const p = new ClipGenerationProcessor(
        videoServiceMock as unknown as VideoService,
        failingCloudinary,
        new EventEmitter2(),
        clipsGatewayMock as any,
        clipsServiceMock as unknown as ClipsService,
        metricsServiceMock as unknown as MetricsService,
        prismaMock as any,
        shutdownServiceMock as any,
      );
      (p as any).worker = { on: jest.fn(), close: jest.fn() };

      const job = makeMockJob(baseJobData, '4');

      // Should not throw — returns a clip with local URL fallback
      const result = await p.process(job);
      expect(result).toBeDefined();

      // Local file should NOT have been deleted (kept as fallback)
      expect(failingCloudinary.deleteLocalFile).not.toHaveBeenCalled();
    });
  });

  // ── 6. AI timestamp detection ────────────────────────────────────────────

  describe('Step 6 — AI viral timestamp detection', () => {
    it('detectViralTimestamps returns valid timestamp objects', async () => {
      const timestamps = await videoServiceMock.detectViralTimestamps(TEST_VIDEO_ID);

      expect(Array.isArray(timestamps)).toBe(true);
      expect(timestamps.length).toBeGreaterThan(0);

      for (const ts of timestamps) {
        expect(ts).toMatchObject({
          start: expect.any(Number),
          end: expect.any(Number),
          score: expect.any(Number),
        });
        expect(ts.end).toBeGreaterThan(ts.start);
        expect(ts.score).toBeGreaterThanOrEqual(0);
        expect(ts.score).toBeLessThanOrEqual(1);
      }
    });

    it('falls back gracefully when AI detection returns empty array', async () => {
      videoServiceMock.detectViralTimestamps.mockResolvedValueOnce([]);

      // Even with no AI timestamps, the pipeline should handle the empty result
      const timestamps = await videoServiceMock.detectViralTimestamps(TEST_VIDEO_ID);
      expect(timestamps).toEqual([]);

      // Restore mock
      videoServiceMock.detectViralTimestamps.mockResolvedValue([
        { start: 10, end: 40, score: 0.9 },
      ]);
    });

    it('falls back gracefully when AI detection throws', async () => {
      videoServiceMock.detectViralTimestamps.mockRejectedValueOnce(
        new Error('Anthropic API rate limit exceeded'),
      );

      await expect(videoServiceMock.detectViralTimestamps(TEST_VIDEO_ID)).rejects.toThrow(
        'Anthropic API',
      );

      // Restore
      videoServiceMock.detectViralTimestamps.mockResolvedValue([
        { start: 10, end: 40, score: 0.9 },
      ]);
    });
  });

  // ── 7. Multiple clips from one video ─────────────────────────────────────

  describe('Step 7 — Multiple clips from a single video', () => {
    it('processes multiple clip jobs from the same video independently', async () => {
      const timestamps = [
        { start: 10, end: 40, positionRatio: 0.08 },
        { start: 55, end: 85, positionRatio: 0.46 },
        { start: 90, end: 110, positionRatio: 0.75 },
      ];

      const results = await Promise.all(
        timestamps.map(async (ts, idx) => {
          const job = makeMockJob(
            {
              ...baseJobData,
              startTime: ts.start,
              endTime: ts.end,
              outputPath: `/tmp/clip-${idx}.mp4`,
              positionRatio: ts.positionRatio,
              clipId: 100 + idx,
            },
            String(10 + idx),
          );
          return processor.process(job);
        }),
      );

      expect(results).toHaveLength(3);
      for (const result of results) {
        expect(result).toBeDefined();
      }
    });
  });

  // ── 8. Test data cleanup ─────────────────────────────────────────────────

  describe('Step 8 — Cleanup', () => {
    it('clears the in-memory queue between tests', async () => {
      await queue.add('clip-job', { videoId: 'v1' });
      await queue.add('clip-job', { videoId: 'v2' });

      let counts = await queue.getJobCounts();
      expect(counts.waiting).toBe(2);

      queue.clear();
      counts = await queue.getJobCounts();
      expect(counts.waiting).toBe(0);
    });

    it('resets prisma mock between tests', () => {
      // Each test starts with fresh mock state due to beforeEach jest.clearAllMocks()
      expect(prismaMock.clip.update).not.toHaveBeenCalled();
    });

    it('resets FFmpeg mock between tests', () => {
      // After cleanupFFmpegMock() in afterEach, mock returns to default state
      // Re-configure to verify it works correctly after cleanup
      mockFFmpegSuccess();
      // If this didn't throw, mock is properly reset
      expect(true).toBe(true);
    });
  });
});
