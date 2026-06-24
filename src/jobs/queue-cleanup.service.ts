import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { RedisService } from '../redis/redis.service';
import { CLIP_GENERATION_QUEUE } from '../clips/clip-generation.queue';
import { EMAIL_DELIVERY_QUEUE } from '../auth/email-delivery.queue';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const CLEAN_BATCH_LIMIT = 1000;
const DEFAULT_RETENTION_DAYS = 30;

/** How many consecutive Redis-down skips to log before going quiet. */
const MAX_SKIP_LOGS = 3;

@Injectable()
export class QueueCleanupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QueueCleanupService.name);
  private readonly clipQueue: Queue;
  private readonly emailQueue: Queue;
  private cleanupTimer?: NodeJS.Timeout;
  private consecutiveSkips = 0;

  constructor(
    private readonly config: ConfigService,
    private readonly redisService: RedisService,
  ) {
    const connection = this.getRedisConnection();
    this.clipQueue = new Queue(CLIP_GENERATION_QUEUE, { connection });
    this.emailQueue = new Queue(EMAIL_DELIVERY_QUEUE, { connection });
  }

  onModuleInit(): void {
    this.scheduleNextCleanup();
  }

  onModuleDestroy(): void {
    if (this.cleanupTimer) {
      clearTimeout(this.cleanupTimer);
    }

    void this.clipQueue.close();
    void this.emailQueue.close();
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
    const queues = [this.clipQueue, this.emailQueue];

    for (const queue of queues) {
      try {
        const removed = await this.cleanCompletedJobs(queue, retentionMs);
        this.logger.log(
          `Removed ${removed} completed jobs older than ${retentionMs / ONE_DAY_MS} days from queue '${queue.name}'`,
        );
      } catch (error) {
        this.logger.error(
          `Failed to clean completed jobs from queue '${queue.name}': ${(error as Error).message}`,
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

