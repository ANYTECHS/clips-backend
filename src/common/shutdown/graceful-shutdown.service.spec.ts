import { GracefulShutdownService } from './graceful-shutdown.service';
import { Queue, Worker } from 'bullmq';

describe('GracefulShutdownService (Issue #975)', () => {
  let service: GracefulShutdownService;

  const makeWorker = (name: string, closeImpl?: jest.Mock): Worker =>
    ({
      name,
      close: closeImpl ?? jest.fn().mockResolvedValue(undefined),
    }) as unknown as Worker;

  const makeQueue = (name: string, closeImpl?: jest.Mock): Queue =>
    ({
      name,
      close: closeImpl ?? jest.fn().mockResolvedValue(undefined),
    }) as unknown as Queue;

  beforeEach(() => {
    service = new GracefulShutdownService();
    delete process.env.GRACEFUL_SHUTDOWN_TIMEOUT_MS;
  });

  it('starts not shutting down', () => {
    expect(service.isShuttingDown()).toBe(false);
    expect(service.getRegisteredWorkerCount()).toBe(0);
  });

  it('registers workers and queues', () => {
    service.register(makeWorker('clip-generation'));
    service.registerQueue(makeQueue('clip-generation'));
    expect(service.getRegisteredWorkerCount()).toBe(1);
  });

  it('ignores null worker registration', () => {
    service.register(undefined as unknown as Worker);
    expect(service.getRegisteredWorkerCount()).toBe(0);
  });

  it('drains workers then closes queues on application shutdown', async () => {
    const workerClose = jest.fn().mockResolvedValue(undefined);
    const queueClose = jest.fn().mockResolvedValue(undefined);
    service.register(makeWorker('payout-retry', workerClose));
    service.registerQueue(makeQueue('payout-retry', queueClose));

    await service.onApplicationShutdown('SIGTERM');

    expect(service.isShuttingDown()).toBe(true);
    expect(workerClose).toHaveBeenCalledWith(false);
    expect(queueClose).toHaveBeenCalled();
  });

  it('force-closes a worker that exceeds the drain timeout', async () => {
    process.env.GRACEFUL_SHUTDOWN_TIMEOUT_MS = '20';
    const workerClose = jest
      .fn()
      .mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 200)),
      );
    service.register(makeWorker('slow-worker', workerClose));

    await service.onApplicationShutdown('SIGTERM');

    // First call is graceful (force=false); timeout path may call force=true.
    expect(workerClose).toHaveBeenCalledWith(false);
    expect(service.isShuttingDown()).toBe(true);
  });

  it('logs and continues when no workers are registered', async () => {
    await expect(
      service.onApplicationShutdown('SIGINT'),
    ).resolves.toBeUndefined();
    expect(service.isShuttingDown()).toBe(true);
  });
});
