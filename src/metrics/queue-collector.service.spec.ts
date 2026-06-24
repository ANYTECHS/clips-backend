import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { QueueCollectorService } from './queue-collector.service';
import { QueueMetricsService } from './queue-metrics.service';

const mockQueue = (failedJobs: { attemptsMade: number; failedReason?: string }[]) => ({
  getJobCounts: jest.fn().mockResolvedValue({
    waiting: 1,
    active: 0,
    completed: 5,
    failed: failedJobs.length,
    delayed: 0,
    prioritized: 0,
  }),
  getFailed: jest.fn().mockResolvedValue(failedJobs),
});

const mockMetrics = () => ({
  recordQueueCounts: jest.fn(),
  recordAvgRetryCount: jest.fn(),
  recordFailureReasonCount: jest.fn(),
});

describe('QueueCollectorService', () => {
  let service: QueueCollectorService;
  let metrics: ReturnType<typeof mockMetrics>;
  let queue: ReturnType<typeof mockQueue>;

  async function build(
    failedJobs: { attemptsMade: number; failedReason?: string }[],
  ): Promise<void> {
    queue = mockQueue(failedJobs);
    metrics = mockMetrics();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QueueCollectorService,
        { provide: QueueMetricsService, useValue: metrics },
        { provide: getQueueToken('clip-generation'), useValue: queue },
      ],
    }).compile();

    service = module.get<QueueCollectorService>(QueueCollectorService);
  }

  it('records average retry count of 0 when there are no failed jobs', async () => {
    await build([]);
    await service.collectMetrics();

    expect(metrics.recordAvgRetryCount).toHaveBeenCalledWith('clip-generation', 0);
  });

  it('calculates correct average retry count', async () => {
    await build([
      { attemptsMade: 3, failedReason: 'timeout' },
      { attemptsMade: 1, failedReason: 'timeout' },
    ]);
    await service.collectMetrics();

    expect(metrics.recordAvgRetryCount).toHaveBeenCalledWith('clip-generation', 2);
  });

  it('aggregates failure reasons and records counts', async () => {
    await build([
      { attemptsMade: 2, failedReason: 'Error: ECONNREFUSED' },
      { attemptsMade: 1, failedReason: 'Error: ECONNREFUSED' },
      { attemptsMade: 3, failedReason: 'Error: timeout' },
    ]);
    await service.collectMetrics();

    expect(metrics.recordFailureReasonCount).toHaveBeenCalledWith(
      'clip-generation',
      'Error: ECONNREFUSED',
      2,
    );
    expect(metrics.recordFailureReasonCount).toHaveBeenCalledWith(
      'clip-generation',
      'Error: timeout',
      1,
    );
  });

  it('uses "unknown" as the reason when failedReason is undefined', async () => {
    await build([{ attemptsMade: 1 }]);
    await service.collectMetrics();

    expect(metrics.recordFailureReasonCount).toHaveBeenCalledWith(
      'clip-generation',
      'unknown',
      1,
    );
  });

  it('truncates long failure reason strings to 120 chars', async () => {
    const longReason = 'Error: ' + 'x'.repeat(200);
    await build([{ attemptsMade: 1, failedReason: longReason }]);
    await service.collectMetrics();

    const calls = metrics.recordFailureReasonCount.mock.calls;
    expect(calls[0][1]).toHaveLength(120);
  });

  it('uses only first line of multi-line failure reason', async () => {
    await build([
      { attemptsMade: 1, failedReason: 'Error: bad thing\n    at foo.ts:10\n    at bar.ts:5' },
    ]);
    await service.collectMetrics();

    expect(metrics.recordFailureReasonCount).toHaveBeenCalledWith(
      'clip-generation',
      'Error: bad thing',
      1,
    );
  });

  it('returns registered queue names', async () => {
    await build([]);
    expect(service.getRegisteredQueues()).toContain('clip-generation');
  });
});
