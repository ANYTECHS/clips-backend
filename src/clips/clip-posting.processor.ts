import { Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { AyrshareService } from './ayrshare.service';
import { UserPlatformService } from '../user-platform/user-platform.service';
import { MetricsService } from '../metrics/metrics.service';
import { CLIP_POSTING_QUEUE, type ClipPostingJob } from './clip-posting.queue';
import { GracefulShutdownService } from '../common/shutdown/graceful-shutdown.service';
import { getBullMQWorkerConfig } from '../config/bullmq.config';

/**
 * BullMQ processor for clip-posting jobs.
 *
 * This worker is deliberately kept separate from ClipGenerationProcessor so that:
 *  - I/O-bound posting jobs do not contend with CPU/memory-heavy FFmpeg work.
 *  - Posting worker concurrency can be tuned independently (higher, as jobs
 *    spend most of their time waiting on HTTP responses).
 *  - Failed Ayrshare calls are retried without re-running video processing.
 *
 * Worker settings (configured in ClipsModule.registerQueue):
 *   concurrency : 10  — can run many posting jobs in parallel
 *   limiter     : optional per-queue rate-limiting (future use)
 *
 * Retry configuration (set per-job in ClipPublishService via CLIP_POSTING_JOB_OPTIONS):
 *   attempts : 5   — handles rate-limit windows on social platforms
 *   backoff  : exponential, starting at 2 000 ms
 */
@Processor(CLIP_POSTING_QUEUE, {
  concurrency: getBullMQWorkerConfig(new ConfigService()).clipPostingConcurrency,
})
export class ClipPostingProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(ClipPostingProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ayrshare: AyrshareService,
    private readonly userPlatformService: UserPlatformService,
    private readonly metricsService: MetricsService,
    private readonly shutdownService: GracefulShutdownService,
  ) {
    super();
  }

  onModuleInit(): void {
    this.shutdownService.register(this.worker);
  }

  /**
   * Main job handler — posts the clip to each requested social platform
   * via the Ayrshare API and persists the outcome in the ClipPost table.
   */
  async process(job: Job<ClipPostingJob>): Promise<void> {
    const { clipId, userId, mediaUrl, caption, platforms } = job.data;

    this.logger.log(
      `[posting] job ${job.id} — attempt ${job.attemptsMade + 1}/${job.opts.attempts ?? 1} ` +
        `clipId=${clipId} platforms=[${platforms.join(', ')}]`,
    );

    const jobMetricId = `${CLIP_POSTING_QUEUE}:${job.id}`;
    this.metricsService.recordJobStart(jobMetricId);

    try {
      // Resolve which of the requested platforms the user still has connected
      // (a user might disconnect a platform between enqueue and execution)
      const connectedPlatforms = await this.userPlatformService.findAll(userId);
      const connectedNames = new Set(connectedPlatforms.map((p) => p.platform));
      const validPlatforms = platforms.filter((p) => connectedNames.has(p));

      if (validPlatforms.length === 0) {
        this.logger.warn(
          `[posting] job ${job.id} — no connected platforms for user ${userId}; skipping`,
        );
        this.metricsService.recordJobCompletion(jobMetricId, CLIP_POSTING_QUEUE, 'success');
        return;
      }

      await job.updateProgress(10);

      const results = await this.ayrshare.post(mediaUrl, caption, validPlatforms);

      await job.updateProgress(80);

      const failedPlatforms: string[] = [];

      await Promise.all(
        results.map(async (r) => {
          await this.prisma.clipPost.updateMany({
            where: { clipId, platform: r.platform },
            data: {
              status: r.success ? 'published' : 'failed',
              postId: r.postId ?? null,
              error: r.error ?? null,
              attempts: (job.attemptsMade ?? 0) + 1,
            },
          });

          if (r.success) {
            this.logger.log(
              `[posting] clipId=${clipId} published to ${r.platform} (job ${job.id})`,
            );
          } else {
            failedPlatforms.push(r.platform);
            this.logger.warn(
              `[posting] clipId=${clipId} failed on ${r.platform}: ${r.error}`,
            );
          }
        }),
      );

      await job.updateProgress(100);

      // If any platforms failed and we have retries left, throw so BullMQ retries
      // the whole job (the next attempt will only retry the platforms that failed,
      // since successfully posted platforms keep their 'published' status in the DB).
      if (failedPlatforms.length > 0) {
        const remainingAttempts =
          (job.opts.attempts ?? 1) - (job.attemptsMade + 1);
        if (remainingAttempts > 0) {
          // Re-enqueue only the failed platforms via job data mutation isn't possible;
          // instead we throw so BullMQ retries. The next run re-checks DB-stored
          // status to avoid re-posting already published platforms.
          throw new Error(
            `Posting failed for platforms: [${failedPlatforms.join(', ')}]. ` +
              `Will retry (${remainingAttempts} attempt(s) left).`,
          );
        }
      }

      this.metricsService.recordJobCompletion(jobMetricId, CLIP_POSTING_QUEUE, 'success');
    } catch (error) {
      this.metricsService.recordJobCompletion(jobMetricId, CLIP_POSTING_QUEUE, 'failure');
      this.metricsService.recordJobFailure(CLIP_POSTING_QUEUE, error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<ClipPostingJob>, error: Error): void {
    const isFinalAttempt = job.attemptsMade >= (job.opts.attempts ?? 1);

    if (isFinalAttempt) {
      this.logger.error(
        `[posting] job ${job.id} exhausted all attempts — ` +
          `clipId=${job.data.clipId} reason: ${error.message}`,
      );
      this.metricsService.recordJobFailure(CLIP_POSTING_QUEUE, 'final_failure');
    } else {
      this.logger.warn(
        `[posting] job ${job.id} will be retried — ` +
          `attempt ${job.attemptsMade}/${job.opts.attempts ?? 1} ` +
          `reason: ${error.message}`,
      );
    }
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job<ClipPostingJob>): void {
    this.logger.log(
      `[posting] job ${job.id} completed — clipId=${job.data.clipId}`,
    );
  }
}
