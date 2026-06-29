/**
 * E2E test: full clip generation flow.
 *
 * Covers issue #236: video upload → AI timestamp detection → FFmpeg cutting → Cloudinary upload.
 *
 * External APIs (Claude/AI, Cloudinary, FFmpeg, Prisma, BullMQ/Redis) are all mocked
 * so the test runs without any real infrastructure.
 */

// Mock cockatiel-dependent services before any imports
jest.mock('../src/common/circuit-breaker/circuit-breaker.service', () => ({
  CircuitBreakerService: class {
    execute(_cfg: any, fn: () => any) { return fn(); }
    reset() {}
    getMetrics() { return undefined; }
  },
}));

// Import and configure FFmpeg mock before other imports
jest.mock('fluent-ffmpeg', () => require('./__mocks__/fluent-ffmpeg'));

// Mock ffmpeg.util with actual implementations that use our mocked fluent-ffmpeg
jest.mock('../src/clips/ffmpeg.util', () => {
  const actual = jest.requireActual('../src/clips/ffmpeg.util');
  return {
    ...actual,
    cutClip: jest.fn(actual.cutClip),
    getVideoMetadata: jest.fn(actual.getVideoMetadata),
  };
});

jest.mock('../src/clips/virality-score.util', () => ({
  calculateViralityScore: jest.fn().mockReturnValue(82),
}));

jest.mock('../src/clips/caption.util', () => ({
  generateCaption: jest.fn().mockReturnValue('Auto-generated caption'),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { getQueueToken } from '@nestjs/bullmq';
import { CLIP_GENERATION_QUEUE } from '../src/clips/clip-generation.queue';
import { ClipsService } from '../src/clips/clips.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { MetricsService } from '../src/metrics/metrics.service';
import { CloudinaryService } from '../src/clips/cloudinary.service';
import { ClipGenerationProcessor } from '../src/clips/clip-generation.processor';
import { ClipsGateway } from '../src/clips/clips.gateway';
import {
  mockFFmpegSuccess,
  mockFFmpegError,
  mockFFmpegOOM,
  cleanupFFmpegMockAfterTest,
} from './helpers/ffmpeg-mock.helper';
import { MockCloudinaryService } from './mocks/cloudinary.mock';

// ── In-memory fakes ───────────────────────────────────────────────────────────

class FakeQueue {
  private jobs: Map<string, any> = new Map();
  private counter = 0;

  async add(name: string, data: any, opts?: any) {
    const id = String(++this.counter);
    const job = { id, name, data, opts, state: 'waiting' };
    this.jobs.set(id, job);
    return job;
  }

  async getJob(id: string) { return this.jobs.get(id) ?? null; }
  async getFailed() { return []; }
  async getJobCounts() { return { waiting: 0, active: 0, delayed: 0, prioritized: 0 }; }
}

class FakePrisma {
  clips: any[] = [];
  videos: any[] = [];

  clip = {
    findUnique: jest.fn(async ({ where }: any) => this.clips.find((c) => c.id === where.id) ?? null),
    findMany: jest.fn(async ({ where }: any = {}) => {
      if (!where) return this.clips;
      return this.clips.filter((c) => {
        if (where.videoId !== undefined && c.videoId !== where.videoId) return false;
        if (where.id?.in && !where.id.in.includes(c.id)) return false;
        return true;
      });
    }),
    count: jest.fn(async () => this.clips.length),
    update: jest.fn(async ({ where, data }: any) => {
      const idx = this.clips.findIndex((c) => c.id === where.id);
      if (idx !== -1) this.clips[idx] = { ...this.clips[idx], ...data };
      return this.clips[idx] ?? null;
    }),
    deleteMany: jest.fn(async () => ({ count: 0 })),
  };

  video = {
    update: jest.fn(async ({ where, data }: any) => {
      const idx = this.videos.findIndex((v) => v.id === where.id);
      if (idx !== -1) this.videos[idx] = { ...this.videos[idx], ...data };
      return this.videos[idx] ?? null;
    }),
  };

  $transaction = jest.fn(async (ops: any[]) => Promise.all(ops));
  $connect = jest.fn();
  $disconnect = jest.fn();
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe('Clip Generation E2E', () => {
  let app: INestApplication;
  let prisma: FakePrisma;
  let queue: FakeQueue;
  let clipsService: ClipsService;
  let processor: ClipGenerationProcessor;
  let cloudinaryService: MockCloudinaryService;

  beforeAll(async () => {
    prisma = new FakePrisma();
    queue = new FakeQueue();
    cloudinaryService = new MockCloudinaryService();

    const metricsService = {
      incrementClipsGenerated: jest.fn(),
      incrementNftMints: jest.fn(),
      setQueueDepth: jest.fn(),
      incrementStellarRpcErrors: jest.fn(),
      incrementCloudinaryUploadErrors: jest.fn(),
      observeHttpDuration: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      imports: [EventEmitterModule.forRoot()],
      providers: [
        ClipsService,
        ClipGenerationProcessor,
        { provide: getQueueToken(CLIP_GENERATION_QUEUE), useValue: queue },
        { provide: PrismaService, useValue: prisma },
        { provide: MetricsService, useValue: metricsService },
        { provide: CloudinaryService, useValue: cloudinaryService },
        { provide: ClipsGateway, useValue: { emitProgressToUser: jest.fn() } },
      ],
    }).compile();

    app = module.createNestApplication();
    await app.init();

    clipsService = module.get(ClipsService);
    processor = module.get(ClipGenerationProcessor);
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    prisma.clips = [];
    prisma.videos = [];
    jest.clearAllMocks();
    cleanupFFmpegMockAfterTest();
    mockFFmpegSuccess(); // Reset to success state
  });

  // ── Success path ────────────────────────────────────────────────────────────

  describe('success path', () => {
    it('enqueues a clip-generation job and returns a jobId', async () => {
      const { jobId } = await clipsService.enqueueClip({
        videoId: 'v1',
        inputPath: '/tmp/in.mp4',
        outputPath: '/tmp/out.mp4',
        startTime: 0,
        endTime: 30,
        positionRatio: 0.0,
      });

      expect(jobId).toBeDefined();
      const job = await queue.getJob(jobId!);
      expect(job).not.toBeNull();
      expect(job.data.videoId).toBe('v1');
    });

    it('processor generates a clip with correct fields', async () => {
      const job = {
        id: 'job-e2e-1',
        data: {
          videoId: 'v1',
          inputPath: '/tmp/in.mp4',
          outputPath: '/tmp/out.mp4',
          startTime: 5,
          endTime: 35,
          positionRatio: 0.1,
          transcript: 'This is a great moment',
          title: 'My Video',
        },
        attemptsMade: 0,
        opts: { attempts: 3 },
        updateProgress: jest.fn(),
      } as any;

      const clip = await processor.process(job);

      expect(clip.videoId).toBe('v1');
      expect(clip.status).toBe('success');
      expect(clip.clipUrl).toContain('cloudinary.com');
      expect(clip.viralityScore).toBe(82);
      expect(clip.selected).toBe(false);
      expect(clip.postStatus).toBeNull();
    });

    it('processor updates clip in DB after completion', async () => {
      prisma.clips.push({ id: 200, clipUrl: '', status: 'processing', updatedAt: new Date() });

      const job = {
        id: 'job-e2e-2',
        data: {
          videoId: 'v2',
          inputPath: '/tmp/in.mp4',
          outputPath: '/tmp/out.mp4',
          startTime: 0,
          endTime: 30,
          positionRatio: 0.5,
          clipId: 200,
        },
        attemptsMade: 0,
        opts: { attempts: 3 },
        updateProgress: jest.fn(),
      } as any;

      const result = await processor.process(job);
      await processor.onCompleted(job, result);

      expect(prisma.clip.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 200 },
          data: expect.objectContaining({ status: 'success' }),
        }),
      );
    });
  });

  // ── Failure path ────────────────────────────────────────────────────────────

  describe('failure path', () => {
    it('processor returns upload_failed status when Cloudinary upload fails', async () => {
      const { cutClip } = require('../src/clips/ffmpeg.util');
      cutClip.mockResolvedValueOnce(undefined);

      jest.spyOn(cloudinaryService, 'uploadVideoFromBuffer').mockResolvedValueOnce({
        secure_url: '',
        public_id: 'test',
        error: 'Network timeout',
      } as any);

      const job = {
        id: 'job-fail-1',
        data: {
          videoId: 'v-fail',
          inputPath: '/tmp/in.mp4',
          outputPath: '/tmp/out.mp4',
          startTime: 0,
          endTime: 30,
          positionRatio: 0.5,
        },
        attemptsMade: 0,
        opts: { attempts: 3 },
        updateProgress: jest.fn(),
      } as any;

      const clip = await processor.process(job);

      expect(clip.status).toBe('upload_failed');
      expect(clip.error).toContain('Cloudinary upload failed');
      expect(clip.localFilePath).toBe('/tmp/out.mp4');
    });

    it('processor propagates FFmpeg errors so BullMQ can retry', async () => {
      mockFFmpegOOM(); // Configure mock to fail with OOM error

      const job = {
        id: 'job-fail-2',
        data: {
          videoId: 'v-fail2',
          inputPath: '/tmp/in.mp4',
          outputPath: '/tmp/out.mp4',
          startTime: 0,
          endTime: 30,
          positionRatio: 0.5,
        },
        attemptsMade: 0,
        opts: { attempts: 3 },
        updateProgress: jest.fn(),
      } as any;

      await expect(processor.process(job)).rejects.toThrow(/memory|OOM/i);
    });

    it('handleClipGenerationFailed marks video as failed in DB', async () => {
      prisma.videos.push({ id: 99, status: 'processing', processingError: null, updatedAt: new Date() });

      await (clipsService as any).handleClipGenerationFailed({
        jobId: 'job-final-fail',
        videoId: '99',
        failedReason: 'All retries exhausted',
        attemptsMade: 3,
      });

      expect(prisma.video.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 99 },
          data: expect.objectContaining({
            status: 'failed',
            processingError: 'All retries exhausted',
          }),
        }),
      );
    });
  });
});
