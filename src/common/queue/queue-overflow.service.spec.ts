import { QueueOverflowService } from './queue-overflow.service';

describe('QueueOverflowService.enqueue', () => {
  it('does not shorten an existing scheduled job delay on overflow', async () => {
    const queue = {
      name: 'clip-posting',
      getJobCounts: jest.fn().mockResolvedValue({
        waiting: 1,
        active: 0,
        delayed: 0,
        prioritized: 0,
      }),
      add: jest.fn().mockResolvedValue({ id: 'job-1' }),
    };
    const service = new QueueOverflowService();

    const result = await service.enqueue({
      queue: queue as any,
      jobName: 'post-clip',
      data: {},
      baseOptions: { delay: 60_000 },
      rateLimitConfig: {
        globalDepthCap: 1,
        overflowDelayMs: 5_000,
      } as any,
    });

    expect(queue.add).toHaveBeenCalledWith(
      'post-clip',
      {},
      expect.objectContaining({ delay: 60_000 }),
    );
    expect(result.delayMs).toBe(60_000);
  });
});
