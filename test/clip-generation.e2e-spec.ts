/**
 * Clip generation e2e smoke — full processor flow covered by unit tests.
 * This suite verifies ClipsService can enqueue via QueueOverflowService.
 */
jest.mock('../src/common/circuit-breaker/circuit-breaker.service', () => ({
  CircuitBreakerService: class {
    execute(_cfg: any, fn: () => any) {
      return fn();
    }
  },
}));

import { EventEmitter2 } from '@nestjs/event-emitter';
import { ClipsService } from '../src/clips/clips.service';
import { CLIP_GENERATION_QUEUE } from '../src/clips/clip-generation.queue';

class InMemoryQueue {
  readonly name = CLIP_GENERATION_QUEUE;
  private jobs = new Map<string, any>();
  private counter = 0;
  async add(name: string, data: any, opts?: any) {
    const id = String(++this.counter);
    this.jobs.set(id, { id, name, data, opts });
    return this.jobs.get(id);
  }
  async getJob(id: string) {
    return this.jobs.get(id) ?? null;
  }
  async getJobCounts() {
    return { waiting: this.jobs.size, active: 0, delayed: 0, prioritized: 0 };
  }
}

describe('Clip Generation E2E', () => {
  it('enqueues a clip-generation job and returns a jobId', async () => {
    const queue = new InMemoryQueue();
    const service = new ClipsService(
      queue as any,
      new EventEmitter2(),
      { clip: { update: jest.fn() } } as any,
      { deleteClip: jest.fn() } as any,
      { setQueueDepth: jest.fn(), incrementClipsGenerated: jest.fn() } as any,
      {
        enqueue: jest.fn(async ({ queue: q, jobName, data, baseOptions }: any) => {
          const job = await q.add(jobName, data, baseOptions);
          return { jobId: job.id, delayed: false, delayMs: 0 };
        }),
      } as any,
      { get: jest.fn((_k: string, d?: string) => d) } as any,
    );

    const { jobId } = await service.enqueueClip({
      videoId: 'v1',
      inputPath: '/tmp/in.mp4',
      outputPath: '/tmp/out.mp4',
      startTime: 0,
      endTime: 30,
      positionRatio: 0.5,
    } as any);

    expect(jobId).toBeDefined();
    expect(await queue.getJob(jobId!)).not.toBeNull();
  });
});
