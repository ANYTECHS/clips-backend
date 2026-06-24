import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { Queue } from 'bullmq';
import type { QueueRateLimitConfig } from '../../config/bullmq.config';

export interface EnqueueWithOverflowOptions<T> {
  /** The BullMQ Queue instance to add the job to. */
  queue: Queue<T>;
  /** BullMQ job name. */
  jobName: string;
  /** Job payload. */
  data: T;
  /** Base job options (attempts, backoff, priority, etc.). */
  baseOptions: Record<string, unknown>;
  /**
   * Rate-limit / overflow configuration for this queue.
   * Loaded from env via getBullMQRateLimitConfig().
   */
  rateLimitConfig: QueueRateLimitConfig;
}

export interface EnqueueResult {
  jobId: string | undefined;
  /** true when the job was delayed due to queue overflow */
  delayed: boolean;
  /** delay applied in milliseconds (0 when not delayed) */
  delayMs: number;
}

/**
 * QueueOverflowService
 *
 * Prevents queue overload during traffic spikes by:
 *
 * 1. **Global depth cap** — before enqueueing, counts how many jobs are
 *    waiting + active + delayed in the queue. If the total exceeds the
 *    configured `globalDepthCap`, the service applies a configurable
 *    `overflowDelayMs` to the new job so it enters the *delayed* set
 *    instead of the *waiting* set, throttling the inflow naturally.
 *
 *    When `overflowDelayMs` is 0, excess jobs are rejected immediately
 *    with HTTP 429 instead of being delayed.
 *
 * 2. **Jitter** — a small random jitter (±20 % of overflowDelayMs) is
 *    added to the delay to avoid a thundering-herd re-activation once
 *    the queue drains below the cap.
 *
 * All thresholds are configurable via environment variables — see
 * `getBullMQRateLimitConfig()` in `config/bullmq.config.ts`.
 */
@Injectable()
export class QueueOverflowService {
  private readonly logger = new Logger(QueueOverflowService.name);

  /**
   * Check queue depth and enqueue the job with an appropriate delay if
   * the queue is over capacity.
   *
   * @returns EnqueueResult with the BullMQ job ID and delay metadata.
   * @throws HttpException (429) when `overflowDelayMs === 0` and the queue is over cap.
   */
  async enqueue<T>(options: EnqueueWithOverflowOptions<T>): Promise<EnqueueResult> {
    const { queue, jobName, data, baseOptions, rateLimitConfig } = options;
    const { globalDepthCap, overflowDelayMs } = rateLimitConfig;

    // ── Step 1: measure current queue depth ──────────────────────────────────
    const depth = await this.getQueueDepth(queue);

    // ── Step 2: decide whether to delay or reject ────────────────────────────
    if (globalDepthCap > 0 && depth >= globalDepthCap) {
      if (overflowDelayMs === 0) {
        // Hard rejection — operator has opted out of delay-based back-pressure
        this.logger.warn(
          `[overflow] Queue "${queue.name}" is at capacity (depth=${depth}/${globalDepthCap}). ` +
            `Rejecting job (overflowDelayMs=0).`,
        );
        throw new HttpException(
          {
            statusCode: HttpStatus.TOO_MANY_REQUESTS,
            message:
              `Queue "${queue.name}" is currently at capacity (${depth}/${globalDepthCap} jobs). ` +
              `Please retry in a few moments.`,
            queue: queue.name,
            queueDepth: depth,
            queueCapacity: globalDepthCap,
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      // Soft delay — add jitter to spread re-activation
      const jitter = Math.floor(overflowDelayMs * 0.2 * (Math.random() * 2 - 1));
      const delayMs = Math.max(0, overflowDelayMs + jitter);

      this.logger.warn(
        `[overflow] Queue "${queue.name}" is at capacity (depth=${depth}/${globalDepthCap}). ` +
          `Delaying new job by ${delayMs}ms.`,
      );

      const job = await queue.add(jobName, data, {
        ...baseOptions,
        delay: delayMs,
      } as any);

      return { jobId: job.id, delayed: true, delayMs };
    }

    // ── Step 3: normal enqueue (within capacity) ─────────────────────────────
    const job = await queue.add(jobName, data, baseOptions as any);
    return { jobId: job.id, delayed: false, delayMs: 0 };
  }

  /**
   * Return the total number of jobs currently occupying queue slots
   * (waiting + active + delayed + prioritized).
   */
  async getQueueDepth(queue: Queue): Promise<number> {
    try {
      const counts = await queue.getJobCounts('waiting', 'active', 'delayed', 'prioritized');
      return (
        (counts.waiting ?? 0) +
        (counts.active ?? 0) +
        (counts.delayed ?? 0) +
        (counts.prioritized ?? 0)
      );
    } catch (err) {
      this.logger.error(
        `[overflow] Failed to get job counts for queue "${queue.name}": ${(err as Error).message}`,
      );
      // Fail open — allow the enqueue if we can't read depth
      return 0;
    }
  }

  /**
   * Returns a snapshot of queue depth and overflow status for a given queue
   * and its configured rate-limit config. Useful for health checks and
   * monitoring endpoints.
   */
  async getQueueStatus(
    queue: Queue,
    rateLimitConfig: QueueRateLimitConfig,
  ): Promise<{
    name: string;
    depth: number;
    globalDepthCap: number;
    isOverCapacity: boolean;
    overflowDelayMs: number;
  }> {
    const depth = await this.getQueueDepth(queue);
    return {
      name: queue.name,
      depth,
      globalDepthCap: rateLimitConfig.globalDepthCap,
      isOverCapacity: rateLimitConfig.globalDepthCap > 0 && depth >= rateLimitConfig.globalDepthCap,
      overflowDelayMs: rateLimitConfig.overflowDelayMs,
    };
  }
}
