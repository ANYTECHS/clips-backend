import { Injectable, Logger, OnModuleInit, OnModuleDestroy, Inject } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { Queue } from 'bullmq';
import { QueueMetricsService } from './queue-metrics.service';
import { getQueueToken } from '@nestjs/bullmq';
import { Optional } from '@nestjs/common';

/** Memory alert threshold (in bytes, default 1 GB) */
const MEMORY_ALERT_THRESHOLD_BYTES = 1 * 1024 * 1024 * 1024;

/**
 * QueueCollectorService periodically collects metrics from all BullMQ queues.
 *
 * This service:
 *   - Discovers all registered queues via dependency injection
 *   - Polls queue stats every 30 seconds
 *   - Records metrics via QueueMetricsService
 *   - Handles queue unavailability gracefully
 *   - Tracks worker memory usage and alerts on high memory
 */
@Injectable()
export class QueueCollectorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QueueCollectorService.name);
  private readonly registeredQueues: Map<string, Queue> = new Map();

  constructor(
    private readonly queueMetrics: QueueMetricsService,
    @Optional()
    @Inject(getQueueToken('clip-generation'))
    private readonly clipGenerationQueue?: Queue,
    @Optional()
    @Inject(getQueueToken('nft-mint'))
    private readonly nftMintQueue?: Queue,
    @Optional()
    @Inject(getQueueToken('email-delivery'))
    private readonly emailDeliveryQueue?: Queue,
    @Optional()
    @Inject(getQueueToken('clip-posting'))
    private readonly clipPostingQueue?: Queue,
    @Optional()
    @Inject(getQueueToken('anomaly-detection'))
    private readonly anomalyDetectionQueue?: Queue,
  ) {
    // Register all available queues
    if (clipGenerationQueue) {
      this.registeredQueues.set('clip-generation', clipGenerationQueue);
    }
    if (nftMintQueue) {
      this.registeredQueues.set('nft-mint', nftMintQueue);
    }
    if (emailDeliveryQueue) {
      this.registeredQueues.set('email-delivery', emailDeliveryQueue);
    }
    if (clipPostingQueue) {
      this.registeredQueues.set('clip-posting', clipPostingQueue);
    }
    if (anomalyDetectionQueue) {
      this.registeredQueues.set('anomaly-detection', anomalyDetectionQueue);
    }
  }

  onModuleInit(): void {
    this.logger.log(`Registered ${this.registeredQueues.size} queues for metrics collection`);
    for (const queueName of this.registeredQueues.keys()) {
      this.logger.debug(`Queue registered: ${queueName}`);
    }
    // Run initial collection immediately
    this.collectMetrics().catch((err) =>
      this.logger.error(`Failed to collect initial metrics: ${err.message}`),
    );
  }

  onModuleDestroy(): void {
    this.logger.log('QueueCollectorService destroyed');
  }

  /**
   * Periodically collect metrics from all registered queues.
   * Runs every 30 seconds.
   */
  @Interval(30000)
  async collectMetrics(): Promise<void> {
    try {
      // Collect worker memory usage
      const memoryUsage = process.memoryUsage();
      this.queueMetrics.recordWorkerMemoryUsage(memoryUsage);

      // Format memory for logging
      const formatBytes = (bytes: number): string => {
        const units = ['B', 'KB', 'MB', 'GB', 'TB'];
        let i = 0;
        while (bytes >= 1024 && i < units.length - 1) {
          bytes /= 1024;
          i++;
        }
        return `${bytes.toFixed(2)} ${units[i]}`;
      };

      const memoryLogPayload = {
        rss: formatBytes(memoryUsage.rss),
        heapTotal: formatBytes(memoryUsage.heapTotal),
        heapUsed: formatBytes(memoryUsage.heapUsed),
        external: formatBytes(memoryUsage.external),
      };

      // Check for memory threshold alert
      if (memoryUsage.rss > MEMORY_ALERT_THRESHOLD_BYTES) {
        this.logger.warn('Worker memory usage above alert threshold', {
          ...memoryLogPayload,
          threshold: formatBytes(MEMORY_ALERT_THRESHOLD_BYTES),
        });
      } else {
        this.logger.debug('Worker memory stats', memoryLogPayload);
      }

      // Collect queue metrics
      for (const [queueName, queue] of this.registeredQueues) {
        try {
          const counts = await queue.getJobCounts(
            'waiting',
            'active',
            'completed',
            'failed',
            'delayed',
            'prioritized',
          );

          this.queueMetrics.recordQueueCounts(queueName, counts);

          // Aggregate retry counts and failure reasons from the last 100 failed jobs
          const failedJobs = await queue.getFailed(0, 100);

          const totalRetries = failedJobs.reduce(
            (sum, job) => sum + (job.attemptsMade || 0),
            0,
          );
          const avgRetries =
            failedJobs.length > 0 ? totalRetries / failedJobs.length : 0;
          this.queueMetrics.recordAvgRetryCount(queueName, avgRetries);

          // Count occurrences of each failure reason and record them
          const reasonCounts = new Map<string, number>();
          for (const job of failedJobs) {
            const reason = job.failedReason ?? 'unknown';
            // Normalise: strip long stack details, keep first line only
            const key = reason.split('\n')[0].slice(0, 120);
            reasonCounts.set(key, (reasonCounts.get(key) ?? 0) + 1);
          }
          for (const [reason, count] of reasonCounts) {
            this.queueMetrics.recordFailureReasonCount(queueName, reason, count);
          }

          this.logger.debug(
            `Queue metrics [${queueName}]: waiting=${counts.waiting}, active=${counts.active}, ` +
              `completed=${counts.completed}, failed=${counts.failed}, avg_retries=${avgRetries.toFixed(2)}`,
          );
        } catch (err) {
          this.logger.error(
            `Failed to collect metrics for queue ${queueName}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    } catch (err) {
      this.logger.error(
        `Critical error in metrics collection: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * Get registered queue names for introspection.
   */
  getRegisteredQueues(): string[] {
    return Array.from(this.registeredQueues.keys());
  }

  /**
   * Get queue statistics (active, waiting, failed jobs).
   * If queueName is provided, returns stats for that specific queue.
   * Otherwise returns stats for all registered queues.
   */
  async getQueueStats(queueName?: string): Promise<Record<string, { active: number; waiting: number; failed: number }>> {
    const stats: Record<string, { active: number; waiting: number; failed: number }> = {};

    const queuesToCheck = queueName
      ? [[queueName, this.registeredQueues.get(queueName)]]
      : Array.from(this.registeredQueues.entries());

    for (const [name, queue] of queuesToCheck) {
      if (!queue) {
        continue;
      }
      try {
        const counts = await queue.getJobCounts('active', 'waiting', 'failed');
        stats[name] = {
          active: counts.active ?? 0,
          waiting: counts.waiting ?? 0,
          failed: counts.failed ?? 0
        };
      } catch (err) {
        this.logger.error(`Failed to get stats for queue ${name}: ${err instanceof Error ? err.message : String(err)}`);
        stats[name] = { active: 0, waiting: 0, failed: 0 };
      }
    }

    return stats;
  }
}
