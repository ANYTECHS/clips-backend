import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, Queue } from 'bullmq';
import { RedisService } from '../redis/redis.service';
import { QueueMetricsService } from '../metrics/queue-metrics.service';
import { CLIP_GENERATION_QUEUE } from '../clips/clip-generation.queue';
import { EMAIL_DELIVERY_QUEUE } from '../auth/email-delivery.queue';
import { CLIP_POSTING_QUEUE } from '../clips/clip-posting.queue';
import { NFT_MINT_QUEUE } from '../clips/nft-mint.queue';
import { ANOMALY_DETECTION_QUEUE } from '../earnings/anomaly-detection.queue';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const CLEAN_BATCH_LIMIT = 1000;
const DEFAULT_RETENTION_DAYS = 30;
const FAILED_JOB_RETENTION_DAYS = 90;

/** How many consecutive Redis-down skips to log before going quiet. */
const MAX_SKIP_LOGS = 3;

@Injectable()
export class QueueCleanupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QueueCleanupService.name);
  private readonly queues: Queue[];
  private cleanupTimer?: NodeJS.Timeout;
  private consecutiveSkips = 0;

  constructor(
    private readonly config: ConfigService,
    private readonly redisService: RedisService,
    private readonly queueMetricsService: QueueMetricsService,
  ) {
    const connection = this.getRedisConnection();
    this.queues = [
      new Queue(CLIP_GENERATION_QUEUE, { connection }),
      new Queue(EMAIL_DELIVERY_QUEUE, { connection }),
      new Queue(CLIP_POSTING_QUEUE, { connection }),
      new Queue(NFT_MINT_QUEUE, { connection }),
      new Queue(ANOMALY_DETECTION_QUEUE, { connection }),
    ];
  }

  onModuleInit(): void {
    this.scheduleNextCleanup();
  }

  onModuleDestroy(): void {
    if (this.cleanupTimer) {
      clearTimeout(this.cleanupTimer);
    }

    for (const queue of this.queues) {
      void queue.close();
    }
  }

  async runCleanup(): Promise<void> {
    // Skip the cleanup run entirely if Redis is known to be down
    if (!this.redisService.isAvailable()) {
      this.consecutiveSkips++;
      if (this.consecutiveSkips <= MAX_SKIP_LOGS) {
        this.logger.warn(
          `Queue cleanup skipped — Redis unavailable (skip #${this.consecutiveSkips})`,
        );
      }
      return;
    }

    this.consecutiveSkips = 0;
    const retentionMs = this.getRetentionMilliseconds();
    const failedRetentionMs = FAILED_JOB_RETENTION_DAYS * ONE_DAY_MS;

    for (const queue of this.queues) {
      try {
        const completedRemoved = await this.cleanCompletedJobs(queue, retentionMs);
        this.logger.log(
          `Removed ${completedRemoved} completed jobs older than ${retentionMs / ONE_DAY_MS} days from queue '${queue.name}'`,
        );
        if (completedRemoved > 0) {
          this.queueMetricsService.recordJobsCleaned(queue.name, 'completed', completedRemoved);
        }

        const failedRemoved = await this.cleanFailedJobs(queue, failedRetentionMs);
        this.logger.log(
          `Removed ${failedRemoved} failed jobs older than ${FAILED_JOB_RETENTION_DAYS} days from queue '${queue.name}'`,
        );
        if (failedRemoved > 0) {
          this.queueMetricsService.recordJobsCleaned(queue.name, 'failed', failedRemoved);
        }
      } catch (error) {
        this.logger.error(
          `Failed to clean jobs from queue '${queue.name}': ${(error as Error).message}`,
          (error as Error).stack,
        );
      }
    }
  }

  private scheduleNextCleanup(): void {
    const delayMs = this.getNextWeeklyDelayMs();
    this.logger.log(
      `Scheduling next BullMQ cleanup in ${Math.round(delayMs / 1000)} seconds`,
    );

    this.cleanupTimer = setTimeout(async () => {
      try {
        await this.runCleanup();
      } catch (error) {
        this.logger.error(
          `Scheduled BullMQ cleanup failed: ${(error as Error).message}`,
          (error as Error).stack,
        );
      } finally {
        this.scheduleNextCleanup();
      }
    }, delayMs);
  }

  private async cleanCompletedJobs(queue: Queue, retentionMs: number): Promise<number> {
    let totalRemoved = 0;

    while (true) {
      const cleanedJobs = await queue.clean(retentionMs, CLEAN_BATCH_LIMIT, 'completed');
      totalRemoved += cleanedJobs.length;
      if (cleanedJobs.length < CLEAN_BATCH_LIMIT) {
        break;
      }
    }

    return totalRemoved;
  }

  private async cleanFailedJobs(queue: Queue, retentionMs: number): Promise<number> {
    let totalRemoved = 0;
    let skippedCount = 0;

    while (true) {
      const failedJobs = await queue.getFailed(0, CLEAN_BATCH_LIMIT);
      if (failedJobs.length === 0) {
        break;
      }

      const jobsToRemove: string[] = [];
      const now = Date.now();

      for (const job of failedJobs) {
        if (this.shouldPreserveFailedJob(job, now, retentionMs)) {
          skippedCount++;
          continue;
        }
        jobsToRemove.push(job.id!);
      }

      if (jobsToRemove.length > 0) {
        for (const jobId of jobsToRemove) {
          await queue.remove(jobId);
          totalRemoved++;
        }
      }

      if (failedJobs.length < CLEAN_BATCH_LIMIT) {
        break;
      }
    }

    if (skippedCount > 0) {
      this.logger.log(
        `Preserved ${skippedCount} required failed jobs in queue '${queue.name}'`,
      );
    }

    return totalRemoved;
  }

  private shouldPreserveFailedJob(job: Job, now: number, retentionMs: number): boolean {
    const jobFinishedOn = job.finishedOn ?? 0;
    const ageMs = now - jobFinishedOn;

    if (ageMs < retentionMs) {
      return true;
    }

    const jobData = job.data as Record<string, unknown>;
    if (jobData.preserve === true) {
      return true;
    }

    if (jobData.requiresManualIntervention === true) {
      return true;
    }

    return false;
  }

  private getRetentionMilliseconds(): number {
    const raw = this.config.get<string>('BULL_JOB_RETENTION_DAYS');
    const retentionDays = Number.parseInt(raw ?? `${DEFAULT_RETENTION_DAYS}`, 10);

    if (Number.isNaN(retentionDays) || retentionDays < 1) {
      return DEFAULT_RETENTION_DAYS * ONE_DAY_MS;
    }

    return retentionDays * ONE_DAY_MS;
  }

  private getNextWeeklyDelayMs(): number {
    const now = new Date();
    const next = new Date(now);
    next.setUTCHours(0, 0, 0, 0);

    const daysUntilSunday = (7 - next.getUTCDay()) % 7;
    next.setUTCDate(next.getUTCDate() + daysUntilSunday);

    if (next.getTime() <= now.getTime()) {
      next.setUTCDate(next.getUTCDate() + 7);
    }

    return next.getTime() - now.getTime();
  }

  private getRedisConnection() {
    const host = this.config.get<string>('REDIS_HOST') ?? 'localhost';
    const port = Number.parseInt(this.config.get<string>('REDIS_PORT') ?? '6379', 10);
    const password = this.config.get<string>('REDIS_PASSWORD');

    return {
      host,
      port,
      password: password || undefined,
    };
  }
}

