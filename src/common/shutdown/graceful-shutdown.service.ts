import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';

/**
 * GracefulShutdownService
 *
 * Coordinates an ordered shutdown of all BullMQ workers so that in-flight
 * jobs are not lost when the process receives SIGTERM (e.g. a deployment
 * rolling-restart or a Kubernetes pod eviction).
 *
 * How job loss happens without this:
 *   1. OS sends SIGTERM → NestJS starts tearing down modules.
 *   2. BullMQ worker's Redis lock expires while the job is still running.
 *   3. The stall-checker on another instance (or the next startup) finds the
 *      job in `active` state without a heartbeat and moves it back to
 *      `waiting` — effectively re-running it from scratch.
 *   4. If the process exits before the job completes, any side-effects
 *      already performed (FFmpeg output file, partial Cloudinary upload)
 *      are lost and the retry starts with a stale state.
 *
 * What this service does instead:
 *   1. Workers are registered via `register()` as soon as they are created.
 *   2. Queues may be registered via `registerQueue()` so their Redis
 *      connections are closed after workers drain.
 *   3. On `onApplicationShutdown()` (triggered by NestJS after SIGTERM):
 *      a. Mark shuttingDown so health endpoints report draining state.
 *      b. Each worker's `close()` method is called with `force: false`, which
 *         tells BullMQ to stop picking up new jobs but wait for any currently
 *         active job to finish.
 *      c. A configurable timeout (default: `GRACEFUL_SHUTDOWN_TIMEOUT_MS`)
 *         is enforced with a race — if a job takes longer the worker is
 *         force-closed and the job is left in `active` state so the stall
 *         checker can recover it cleanly on the next instance.
 *      d. Registered queues are closed so Redis connections are released.
 *
 * Usage — in each processor onModuleInit:
 *   this.shutdownService.register(this.worker);
 */
@Injectable()
export class GracefulShutdownService implements OnApplicationShutdown {
  private readonly logger = new Logger(GracefulShutdownService.name);
  private readonly workers = new Set<Worker>();
  private readonly queues = new Set<Queue>();
  private shuttingDown = false;

  /** Whether the process is currently draining workers. */
  isShuttingDown(): boolean {
    return this.shuttingDown;
  }

  /** Number of workers currently registered (useful for health / tests). */
  getRegisteredWorkerCount(): number {
    return this.workers.size;
  }

  /** Register a BullMQ Worker so it participates in graceful drain. */
  register(worker: Worker): void {
    if (!worker) {
      this.logger.warn('Attempted to register a null/undefined worker — skipped');
      return;
    }
    this.workers.add(worker);
    this.logger.debug(
      `Registered worker for queue "${worker.name}" (total: ${this.workers.size})`,
    );
  }

  /** Unregister a worker (called from onModuleDestroy if needed). */
  unregister(worker: Worker): void {
    this.workers.delete(worker);
  }

  /**
   * Register a BullMQ Queue so its Redis connection is closed after workers
   * finish draining.
   */
  registerQueue(queue: Queue): void {
    if (!queue) return;
    this.queues.add(queue);
    this.logger.debug(
      `Registered queue "${queue.name}" for shutdown close (total: ${this.queues.size})`,
    );
  }

  /**
   * Called by NestJS when the application begins shutdown.
   * Gracefully drains every registered worker within the configured timeout,
   * then closes queue Redis connections.
   */
  async onApplicationShutdown(signal?: string): Promise<void> {
    this.shuttingDown = true;

    if (this.workers.size === 0 && this.queues.size === 0) {
      this.logger.log(
        `[shutdown] Signal=${signal ?? 'unknown'} — no workers/queues registered`,
      );
      return;
    }

    const timeoutMs =
      parseInt(process.env.GRACEFUL_SHUTDOWN_TIMEOUT_MS ?? '30000', 10);

    this.logger.log(
      `[shutdown] Signal=${signal ?? 'unknown'} — draining ${this.workers.size} worker(s) ` +
        `and closing ${this.queues.size} queue(s) (timeout=${timeoutMs}ms)...`,
    );

    await Promise.all(
      Array.from(this.workers).map((worker) =>
        this.drainWorker(worker, timeoutMs),
      ),
    );

    this.logger.log('[shutdown] All workers drained. Closing queue connections...');

    await Promise.all(
      Array.from(this.queues).map((queue) => this.closeQueue(queue)),
    );

    this.logger.log('[shutdown] Graceful shutdown complete.');
  }

  private async drainWorker(worker: Worker, timeoutMs: number): Promise<void> {
    const name = worker.name;

    const drainPromise = worker.close(/* force= */ false).then(() => {
      this.logger.log(`[shutdown] Worker "${name}" drained cleanly.`);
    });

    const timeoutPromise = new Promise<void>((resolve) =>
      setTimeout(() => {
        this.logger.warn(
          `[shutdown] Worker "${name}" did not drain within ${timeoutMs}ms — force-closing. ` +
            `Active jobs will be recovered by the stall checker on the next instance.`,
        );
        // Best-effort force close; ignore errors if already closed.
        void worker.close(true).catch(() => undefined);
        resolve();
      }, timeoutMs),
    );

    try {
      await Promise.race([drainPromise, timeoutPromise]);
    } catch (err) {
      this.logger.error(
        `[shutdown] Error draining worker "${name}": ${(err as Error).message}`,
      );
    }
  }

  private async closeQueue(queue: Queue): Promise<void> {
    try {
      await queue.close();
      this.logger.log(`[shutdown] Queue "${queue.name}" Redis connection closed.`);
    } catch (err) {
      this.logger.warn(
        `[shutdown] Error closing queue "${queue.name}": ${(err as Error).message}`,
      );
    }
  }
}
