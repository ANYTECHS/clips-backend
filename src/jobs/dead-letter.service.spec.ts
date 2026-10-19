import { NotFoundException } from '@nestjs/common';
import { DeadLetterService } from './dead-letter.service';

function makeJob(overrides: Partial<any> = {}) {
  return {
    id: 'job-1',
    name: 'clip',
    data: { clipId: 1 },
    failedReason: 'boom',
    stacktrace: [],
    attemptsMade: 3,
    finishedOn: 1,
    processedOn: 1,
    getState: async () => 'failed',
    retry: jest.fn(),
    ...overrides,
  };
}

function makeQueue(name: string, failed: any[] = []) {
  return {
    name,
    getFailed: jest.fn(async () => failed),
    getJob: jest.fn(async (id: string) => failed.find((j) => j.id === id)),
  };
}

function makeService(failedByQueue: Record<string, any[]> = {}) {
  const clipQueue = makeQueue('clip-generation', failedByQueue['clip-generation'] ?? []);
  const postingQueue = makeQueue('clip-posting', failedByQueue['clip-posting'] ?? []);
  const mintQueue = makeQueue('nft-mint', failedByQueue['nft-mint'] ?? []);
  const service = new DeadLetterService(
    clipQueue as any,
    postingQueue as any,
    mintQueue as any,
  );
  return { service, clipQueue, postingQueue, mintQueue };
}

describe('DeadLetterService (#901)', () => {
  it('aggregates failed jobs across all queues', async () => {
    const { service } = makeService({
      'clip-generation': [makeJob({ id: 'a' })],
      'nft-mint': [makeJob({ id: 'b' })],
    });
    const out = await service.listFailed();
    expect(out.map((j) => j.id).sort()).toEqual(['a', 'b']);
    expect(out[0].failedReason).toBe('boom');
    expect(out[0].attemptsMade).toBe(3);
  });

  it('filters by queue and respects limit', async () => {
    const { service } = makeService({
      'clip-generation': [makeJob({ id: 'a' }), makeJob({ id: 'b' })],
      'nft-mint': [makeJob({ id: 'c' })],
    });
    const out = await service.listFailed('clip-generation', 1);
    expect(out).toHaveLength(1);
    expect(out[0].queue).toBe('clip-generation');
  });

  it('retries a failed job by id', async () => {
    const job = makeJob({ id: 'a' });
    const { service } = makeService({ 'clip-generation': [job] });
    const res = await service.retry('a');
    expect(job.retry).toHaveBeenCalled();
    expect(res.queue).toBe('clip-generation');
  });

  it('throws 404 when job is not in dead letter', async () => {
    const { service } = makeService({});
    await expect(service.retry('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('skips non-failed jobs when replaying', async () => {
    const job = makeJob({ id: 'a', getState: async () => 'completed' });
    const { service } = makeService({ 'clip-generation': [job] });
    await expect(service.retry('a')).rejects.toBeInstanceOf(NotFoundException);
    expect(job.retry).not.toHaveBeenCalled();
  });
});
