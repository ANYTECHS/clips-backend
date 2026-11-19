import { Injectable, Logger, Inject, Optional } from '@nestjs/common';
import { Queue } from 'bullmq';
import { getQueueToken } from '@nestjs/bullmq';
import {
  QueueHealthDto,
  QueueHealthResponseDto,
  QueueJobCountDto,
  QueueStatisticsDto,
  QueueStatisticsResponseDto,
} from './dtos/queue-stats.dto';
import { RetryBackoffConfigService } from './retry-backoff-config.service';

/**
 * QueueHealthService provides health and statistics endpoints for monitoring
 * the status of all BullMQ queues in the system.
 */
@Injectable()
export class QueueHealthService {
  private readonly logger = new Logger(QueueHealthService.name);
  private readonly registeredQueues: Map<string, Queue> = new Map();
  private readonly jobStats: Map<string, { completed: number; failed: number }> =
    new Map();

  constructor(
    private readonly retryBackoffConfig: RetryBackoffConfigService,
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
    this.registerQueues();
  }

  private registerQueues(): void {
    if (this.clipGenerationQueue) {
      this.registeredQueues.set('clip-generation', this.clipGenerationQueue);
    }
    if (this.nftMintQueue) {
      this.registeredQueues.set('nft-mint', this.nftMintQueue);
    }
    if (this.emailDeliveryQueue) {
      this.registeredQueues.set('email-delivery', this.emailDeliveryQueue);
    }
    if (this.clipPostingQueue) {
      this.registeredQueues.set('clip-posting', this.clipPostingQueue);
    }
    if (this.anomalyDetectionQueue) {
      this.registeredQueues.set('anomaly-detection', this.anomalyDetectionQueue);
    }

    this.logger.log(
      `Registered ${this.registeredQueues.size} queues for health monitoring`,
    );

    // Initialize job stats for each queue
    for (const queueName of this.registeredQueues.keys()) {
      this.jobStats.set(queueName, { completed: 0, failed: 0 });
    }
  }

  /**
   * Get health metrics for all queues.
   */
  async getQueueHealth(): Promise<QueueHealthResponseDto> {
    const queueHealths: QueueHealthDto[] = [];

    for (const [queueName, queue] of this.registeredQueues) {
      try {
        const health = await this.getQueueHealthMetrics(queueName, queue);
        queueHealths.push(health);
      } catch (err) {
        this.logger.error(
          `Failed to get health for queue ${queueName}: ${(err as Error).message}`,
        );
        // Return degraded health for this queue
        queueHealths.push(this.getHealthDegraded(queueName));
      }
    }

    // Calculate overall system health
    const systemStatus = this.calculateSystemHealth(queueHealths);
    const totalJobs = queueHealths.reduce((sum, q) => sum + q.totalJobs, 0);
    const systemWideFailureRate =
      queueHealths.length > 0
        ? queueHealths.reduce((sum, q) => sum + q.failureRate, 0) /
          queueHealths.length
        : 0;

    return {
      status: systemStatus,
      queues: queueHealths,
      totalJobsAcrossQueues: totalJobs,
      systemWideFailureRate: parseFloat(systemWideFailureRate.toFixed(2)),
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Get detailed statistics for all queues.
   */
  async getQueueStatistics(): Promise<QueueStatisticsResponseDto> {
    const queueStats: QueueStatisticsDto[] = [];

    for (const [queueName, queue] of this.registeredQueues) {
      try {
        const stats = await this.getQueueStats(queueName, queue);
        queueStats.push(stats);
      } catch (err) {
        this.logger.error(
          `Failed to get statistics for queue ${queueName}: ${(err as Error).message}`,
        );
      }
    }

    return {
      queues: queueStats,
      timestamp: new Date().toISOString(),
    };
  }

  private async getQueueHealthMetrics(
    queueName: string,
    queue: Queue,
  ): Promise<QueueHealthDto> {
    const counts = await this.getQueueJobCounts(queue);
    const totalJobs = this.calculateTotalJobs(counts);
    const failureRate = this.calculateFailureRate(
      counts.failed,
      counts.completed,
    );
    const avgRetryCount = await this.calculateAvgRetryCount(queue);

    // Determine health status
    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    if (failureRate > 20 || counts.failed > 100) {
      status = 'unhealthy';
    } else if (failureRate > 10 || counts.failed > 50) {
      status = 'degraded';
    }

    return {
      queue: queueName,
      status,
      jobs: counts,
      totalJobs,
      failureRate: parseFloat(failureRate.toFixed(2)),
      avgRetryCount: parseFloat(avgRetryCount.toFixed(2)),
      timestamp: new Date().toISOString(),
    };
  }

  private async getQueueStats(
    queueName: string,
    queue: Queue,
  ): Promise<QueueStatisticsDto> {
    const counts = await this.getQueueJobCounts(queue);
    const totalProcessed = counts.completed + counts.failed;
    const failureRate = this.calculateFailureRate(
      counts.failed,
      counts.completed,
    );
    const avgRetryCount = await this.calculateAvgRetryCount(queue);
    const failureReasons = await this.getFailureReasons(queue);

    // Get average processing time from completed jobs
    const avgProcessingTime = await this.getAvgProcessingTime(queue);

    return {
      queue: queueName,
      jobCounts: counts,
      totalProcessed,
      successCount: counts.completed,
      failureCount: counts.failed,
      failureRate: parseFloat(failureRate.toFixed(2)),
      avgProcessingTimeSeconds: parseFloat(avgProcessingTime.toFixed(2)),
      avgRetryCount: parseFloat(avgRetryCount.toFixed(2)),
      failureReasonCounts: failureReasons,
      timestamp: new Date().toISOString(),
    };
  }

  private async getQueueJobCounts(queue: Queue): Promise<QueueJobCountDto> {
    try {
      const [waiting, active, completed, failed, delayed, prioritized] =
        await Promise.all([
          queue.count(),
          queue.getActiveCount(),
          queue.getCompletedCount(),
          queue.getFailedCount(),
          queue.getDelayedCount(),
          queue.getPrioritizedCount?.(),
        ]);

      return {
        waiting,
        active,
        completed,
        failed,
        delayed,
        prioritized: prioritized ?? 0,
      };
    } catch (err) {
      this.logger.error(
        `Failed to get queue job counts: ${(err as Error).message}`,
      );
      return {
        waiting: 0,
        active: 0,
        completed: 0,
        failed: 0,
        delayed: 0,
        prioritized: 0,
      };
    }
  }

  private calculateTotalJobs(counts: QueueJobCountDto): number {
    return (
      counts.waiting +
      counts.active +
      counts.completed +
      counts.failed +
      counts.delayed +
      counts.prioritized
    );
  }

  private calculateFailureRate(failed: number, completed: number): number {
    const total = failed + completed;
    if (total === 0) return 0;
    return (failed / total) * 100;
  }

  private async calculateAvgRetryCount(queue: Queue): Promise<number> {
    try {
      // Get last 100 completed and failed jobs to calculate average retry count
      const completedJobs = await queue.getCompleted(0, 99);
      const failedJobs = await queue.getFailed(0, 99);

      const allJobs = [...completedJobs, ...failedJobs];
      if (allJobs.length === 0) return 0;

      const totalRetries = allJobs.reduce(
        (sum, job) => sum + (job.attemptsMade ?? 0),
        0,
      );

      // attemptsMade includes the initial attempt, so subtract 1
      return Math.max(0, totalRetries / allJobs.length - 1);
    } catch (err) {
      this.logger.error(
        `Failed to calculate avg retry count: ${(err as Error).message}`,
      );
      return 0;
    }
  }

  private async getFailureReasons(
    queue: Queue,
  ): Promise<Record<string, number>> {
    try {
      const failedJobs = await queue.getFailed(0, 99);
      const reasons: Record<string, number> = {};

      for (const job of failedJobs) {
        const reason = job.failedReason || 'unknown';
        // Extract just the first line of the failure reason
        const shortReason = reason.split('\n')[0].split(':')[0].toLowerCase();
        reasons[shortReason] = (reasons[shortReason] ?? 0) + 1;
      }

      return reasons;
    } catch (err) {
      this.logger.error(
        `Failed to get failure reasons: ${(err as Error).message}`,
      );
      return {};
    }
  }

  private async getAvgProcessingTime(queue: Queue): Promise<number> {
    try {
      const completedJobs = await queue.getCompleted(0, 99);
      if (completedJobs.length === 0) return 0;

      const totalDuration = completedJobs.reduce((sum, job) => {
        const duration =
          (job.finishedOn ?? 0) - (job.processedOn ?? job.finishedOn ?? 0);
        return sum + duration;
      }, 0);

      // Convert milliseconds to seconds
      return totalDuration / completedJobs.length / 1000;
    } catch (err) {
      this.logger.error(
        `Failed to get avg processing time: ${(err as Error).message}`,
      );
      return 0;
    }
  }

  private calculateSystemHealth(
    queueHealths: QueueHealthDto[],
  ): 'healthy' | 'degraded' | 'unhealthy' {
    if (queueHealths.length === 0) return 'healthy';

    const unhealthyCount = queueHealths.filter(
      (q) => q.status === 'unhealthy',
    ).length;
    const degradedCount = queueHealths.filter(
      (q) => q.status === 'degraded',
    ).length;

    if (unhealthyCount > 0) return 'unhealthy';
    if (degradedCount > 0) return 'degraded';
    return 'healthy';
  }

  private getHealthDegraded(queueName: string): QueueHealthDto {
    return {
      queue: queueName,
      status: 'degraded',
      jobs: {
        waiting: 0,
        active: 0,
        completed: 0,
        failed: 0,
        delayed: 0,
        prioritized: 0,
      },
      totalJobs: 0,
      failureRate: 0,
      avgRetryCount: 0,
      timestamp: new Date().toISOString(),
    };
  }
}
