import { HealthController } from './health.controller';

describe('HealthController — worker shutdown reflection (Issue #975)', () => {
  let controller: HealthController;
  let mockRedisMemoryService: any;
  let mockRedisService: any;
  let mockRedisHealthService: any;
  let mockQueueHealthService: any;
  let mockSorobanHealthService: any;
  let mockGracefulShutdown: any;

  beforeEach(() => {
    mockRedisMemoryService = { getStats: jest.fn() };
    mockRedisService = {};
    mockRedisHealthService = {
      check: jest.fn().mockResolvedValue({
        status: 'healthy',
        service: 'redis',
        connected: true,
        latencyMs: 5,
      }),
    };
    mockQueueHealthService = {
      getQueueHealth: jest.fn().mockResolvedValue({
        status: 'healthy',
        queues: [],
        totalJobsAcrossQueues: 0,
        systemWideFailureRate: 0,
        timestamp: new Date().toISOString(),
      }),
    };
    mockSorobanHealthService = { check: jest.fn() };
    mockGracefulShutdown = {
      isShuttingDown: jest.fn().mockReturnValue(false),
      getRegisteredWorkerCount: jest.fn().mockReturnValue(5),
    };

    controller = new HealthController(
      mockRedisMemoryService,
      mockRedisService,
      mockRedisHealthService,
      mockQueueHealthService,
      mockSorobanHealthService,
      mockGracefulShutdown,
    );
  });

  it('returns healthy status when not shutting down', async () => {
    const result = await controller.getHealth();
    expect(result.status).toBe('healthy');
    expect(result.workers.shuttingDown).toBe(false);
    expect(result.workers.registered).toBe(5);
  });

  it('returns draining status when workers are shutting down (SIGTERM)', async () => {
    mockGracefulShutdown.isShuttingDown.mockReturnValue(true);

    const result = await controller.getHealth();
    expect(result.status).toBe('draining');
    expect(result.workers.shuttingDown).toBe(true);
    expect(result.workers.registered).toBe(5);
  });

  it('reflects degraded queue health when workers are shutting down', async () => {
    mockGracefulShutdown.isShuttingDown.mockReturnValue(true);

    const result = await controller.checkQueueHealth();
    expect(result.status).toBe('degraded');
  });
});
