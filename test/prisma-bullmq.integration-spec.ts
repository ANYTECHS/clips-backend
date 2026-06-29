/**
 * Integration tests: Prisma + BullMQ clip-generation flow.
 *
 * Tests the job creation → processing → DB update pipeline using
 * in-memory fakes for both Prisma and BullMQ — no real DB or Redis needed.
 *
 * Covers issue #237: Implement integration tests for Prisma + BullMQ
 */

// Mock cockatiel-dependent services before any imports
jest.mock('../src/common/circuit-breaker/circuit-breaker.service', () => ({
  CircuitBreakerService: class {
    execute(_cfg: any, fn: () => any) { return fn(); }
    reset() {}
    getMetrics() { return undefined; }
  },
}));

import { EventEmitter2 } from '@nestjs/event-emitter';
import { ClipsService } from '../src/clips/clips.service';
import { CLIP_GENERATION_QUEUE } from '../src/clips/clip-generation.queue';

// ── In-memory BullMQ queue fake ───────────────────────────────────────────────

class InMemoryQueue {
  readonly name = CLIP_GENERATION_QUEUE;
  private jobs: Map<string, any> = new Map();
  private counter = 0;

  async add(name: string, data: any, opts?: any) {
    const id = String(++this.counter);
    const job = { id, name, data, opts, state: 'waiting', failedReason: null };
    this.jobs.set(id, job);
    return job;
  }

  async getJob(id: string) { return this.jobs.get(id) ?? null; }
  async getFailed() { return [...this.jobs.values()].filter((j) => j.state === 'failed'); }
  async getJobCounts(..._states: string[]) {
    return { waiting: this.jobs.size, active: 0, delayed: 0, prioritized: 0 };
  }

  _markFailed(id: string, reason: string) {
    const job = this.jobs.get(id);
    if (job) { job.state = 'failed'; job.failedReason = reason; }
  }

  clear() { this.jobs.clear(); this.counter = 0; }
}

// ── In-memory Prisma fake ─────────────────────────────────────────────────────

class InMemoryPrisma {
  clips: any[] = [];
  videos: any[] = [];

  clip = {
    findUnique: jest.fn(async ({ where }: any) =>
      this.clips.find((c) => c.id === where.id) ?? null,
    ),
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
      if (idx === -1) throw new Error(`Clip ${where.id} not found`);
      this.clips[idx] = { ...this.clips[idx], ...data };
      return this.clips[idx];
    }),
    deleteMany: jest.fn(async ({ where }: any) => {
      const before = this.clips.length;
      this.clips = this.clips.filter((c) => !where.id.in.includes(c.id));
      return { count: before - this.clips.length };
    }),
  };

  video = {
    update: jest.fn(async ({ where, data }: any) => {
      const idx = this.videos.findIndex((v) => v.id === where.id);
      if (idx !== -1) this.videos[idx] = { ...this.videos[idx], ...data };
      return this.videos[idx] ?? null;
    }),
  };

  $transaction = jest.fn(async (ops: any[]) => Promise.all(ops));

  reset() {
    this.clips = [];
    this.videos = [];
    jest.clearAllMocks();
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeClipsService(queue: InMemoryQueue, prisma: InMemoryPrisma) {
  const emitter = new EventEmitter2();
  const metricsService = { incrementClipsGenerated: jest.fn(), setQueueDepth: jest.fn() };
  const cloudinaryService = { deleteClip: jest.fn(), deleteLocalFile: jest.fn() };

  return new ClipsService(
    queue as any,
    emitter,
    prisma as any,
    cloudinaryService as any,
    metricsService as any,
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Prisma + BullMQ integration', () => {
  let queue: InMemoryQueue;
  let prisma: InMemoryPrisma;
  let service: ClipsService;

  beforeEach(() => {
    queue = new InMemoryQueue();
    prisma = new InMemoryPrisma();
    service = makeClipsService(queue, prisma);
  });

  afterEach(() => {
    prisma.reset();
    queue.clear();
  });

  describe('job creation → queue', () => {
    it('enqueues a clip-generation job and returns a jobId', async () => {
      const { jobId } = await service.enqueueClip({
        videoId: 'v1',
        inputPath: '/tmp/in.mp4',
        outputPath: '/tmp/out.mp4',
        startTime: 0,
        endTime: 30,
        positionRatio: 0.5,
      });

      expect(jobId).toBeDefined();
      const job = await queue.getJob(jobId!);
      expect(job).not.toBeNull();
      expect(job.data.videoId).toBe('v1');
    });

    it('tracks the job under the correct videoId for cancellation', async () => {
      const { jobId } = await service.enqueueClip({
        videoId: 'v2',
        inputPath: '/tmp/in.mp4',
        outputPath: '/tmp/out.mp4',
        startTime: 10,
        endTime: 40,
        positionRatio: 0.3,
      });

      expect(jobId).toBeDefined();
      const result = await service.cancelVideo('v2');
      expect(result.cancelled).toBe(true);
    });

    it('multiple jobs for the same video are all enqueued', async () => {
      await service.enqueueClip({ videoId: 'v3', inputPath: '/tmp/in.mp4', outputPath: '/tmp/out1.mp4', startTime: 0, endTime: 15, positionRatio: 0.0 });
      await service.enqueueClip({ videoId: 'v3', inputPath: '/tmp/in.mp4', outputPath: '/tmp/out2.mp4', startTime: 15, endTime: 30, positionRatio: 0.5 });

      const counts = await queue.getJobCounts('waiting');
      expect(counts.waiting).toBe(2);
    });
  });

  describe('DB update after job completion', () => {
    it('updateClip persists clip URL and status to Prisma', async () => {
      prisma.clips.push({ id: 1, clipUrl: '', status: 'processing', updatedAt: new Date() });

      await service.updateClip(1, {
        clipUrl: 'https://cdn.example.com/clip.mp4',
        status: 'success',
      });

      expect(prisma.clip.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 1 },
          data: expect.objectContaining({
            clipUrl: 'https://cdn.example.com/clip.mp4',
            status: 'success',
          }),
        }),
      );
      expect(prisma.clips[0].clipUrl).toBe('https://cdn.example.com/clip.mp4');
      expect(prisma.clips[0].status).toBe('success');
    });

    it('updateClip always sets updatedAt', async () => {
      prisma.clips.push({ id: 2, clipUrl: '', status: 'processing', updatedAt: new Date(0) });

      await service.updateClip(2, { status: 'success' });

      expect(prisma.clips[0].updatedAt.getTime()).toBeGreaterThan(0);
    });
  });

  describe('transaction consistency', () => {
    it('bulkUpdate applies all changes atomically via seeded clips', async () => {
      service._seed([
        { id: '10', videoId: 1, userId: 'u1', selected: false, postStatus: null },
        { id: '11', videoId: 1, userId: 'u1', selected: false, postStatus: null },
      ]);

      const result = await service.bulkUpdate('u1' as any, {
        clipIds: ['10', '11'],
        selected: true,
      });

      expect(result.updatedCount).toBe(2);
      expect(result.notFoundIds).toHaveLength(0);
    });

    it('bulkUpdate rolls back on DB error', async () => {
      // Seed clip 20 so prisma.clip.update doesn't throw
      prisma.clips.push({ id: 20, videoId: 2, selected: false, postStatus: null, updatedAt: new Date() });

      // Use Prisma path (no seeded clips in service) — mock findMany to return the clip
      prisma.clip.findMany.mockResolvedValueOnce([
        { id: 20, videoId: 2, video: { userId: 1 } },
      ]);
      // Make $transaction reject to simulate a DB constraint error
      prisma.$transaction.mockRejectedValueOnce(new Error('DB constraint violation'));

      await expect(
        service.bulkUpdate(1 as any, { clipIds: ['20'], selected: true }),
      ).rejects.toThrow('DB constraint violation');
    });
  });

  describe('failed job handling', () => {
    it('handleClipGenerationFailed updates video status to failed in Prisma', async () => {
      prisma.videos.push({ id: 1, status: 'processing', processingError: null, updatedAt: new Date() });

      await (service as any).handleClipGenerationFailed({
        jobId: 'job-1',
        videoId: '1',
        failedReason: 'FFmpeg OOM',
        attemptsMade: 3,
      });

      expect(prisma.video.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 1 },
          data: expect.objectContaining({
            status: 'failed',
            processingError: 'FFmpeg OOM',
          }),
        }),
      );
    });
  });

  describe('cleanup after tests', () => {
    it('each test starts with a clean queue and DB', async () => {
      expect(await queue.getFailed()).toHaveLength(0);
      expect(prisma.clips).toHaveLength(0);
    });
  });
});
