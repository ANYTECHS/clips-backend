import { register } from 'prom-client';
import { QueueMetricsService } from './queue-metrics.service';

describe('QueueMetricsService (Issue #1274)', () => {
  let service: QueueMetricsService;

  beforeEach(() => {
    register.clear();
    service = new QueueMetricsService();
  });

  afterEach(() => {
    register.clear();
  });

  it('initializes all queue metrics without throwing', () => {
    const metrics = service.getMetrics();
    expect(metrics.jobCount).toBeDefined();
    expect(metrics.activeJobs).toBeDefined();
    expect(metrics.queueDepth).toBeDefined();
    expect(metrics.totalJobs).toBeDefined();
    expect(metrics.failureRate).toBeDefined();
    expect(metrics.jobThroughput).toBeDefined();
    expect(metrics.jobDuration).toBeDefined();
    expect(metrics.jobFailures).toBeDefined();
    expect(metrics.jobCompletions).toBeDefined();
    expect(metrics.workerMemoryUsage).toBeDefined();
  });

  it('records queue counts, active jobs, depth, and failure rate', () => {
    expect(() => {
      service.recordQueueCounts('clip-generation', {
        waiting: 5,
        active: 2,
        completed: 18,
        failed: 2,
        delayed: 1,
        prioritized: 0,
      });
    }).not.toThrow();
  });

  it('records job start and completion with duration observation', () => {
    service.recordJobStart('job-123');
    expect(() => {
      service.recordJobCompletion('job-123', 'clip-generation', 'success');
    }).not.toThrow();
  });

  it('records job failure with reason', () => {
    expect(() => {
      service.recordJobFailure('clip-generation', 'timeout');
    }).not.toThrow();
  });

  it('records active jobs, queue depth, and throughput explicitly', () => {
    expect(() => {
      service.recordActiveJobs('clip-generation', 3);
      service.recordQueueDepth('clip-generation', 6);
      service.recordTotalJobs('clip-generation', 25);
      service.recordFailureRate('clip-generation', 0.08);
      service.recordThroughput('clip-generation', 12.5);
    }).not.toThrow();
  });

  it('records worker memory usage without error', () => {
    expect(() => {
      service.recordWorkerMemoryUsage({
        rss: 100000000,
        heapTotal: 80000000,
        heapUsed: 50000000,
        external: 10000000,
        arrayBuffers: 5000000,
      });
    }).not.toThrow();
  });

  it('clears job start times on cleanup', () => {
    service.recordJobStart('job-999');
    service.clearJobStartTimes();
    expect(() => {
      service.recordJobCompletion('job-999', 'clip-generation', 'success');
    }).not.toThrow();
  });
});
