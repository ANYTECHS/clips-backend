import { InjectQueue, Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger, OnModuleInit } from '@nestjs/common';
import { Job, Queue, UnrecoverableError } from 'bullmq';
import { DailyEarningsAggregationService } from './daily-earnings-aggregation.service';
import { GracefulShutdownService } from '../common/shutdown/graceful-shutdown.service';
import { MetricsService } from '../metrics/metrics.service';
import {
  DAILY_EARNINGS_CRON,
  DAILY_EARNINGS_JOB,
  DAILY_EARNINGS_QUEUE,
  DAILY_EARNINGS_TIMEZONE,
  DailyEarningsJobData,
} from './daily-earnings.queue';
import {
  handleFailedEvent,
  handleProcessingError,
} from '../queue/processor-error.handler';

/**
 * Repeatable BullMQ job that rolls the previous UTC day's earnings up into
 * `DailyEarning` and refreshes each affected user's summary (Issue #767 / #979).
 *
 * Concurrency is pinned to 1: two overlapping runs would upsert the same
 * `(userId, date, currency)` rows and race on the summary recomputation.
 *
 * Error handling follows the standardized processor contract (Issue #1235):
 * invalid dates fail permanently via `UnrecoverableError`, transient failures
 * retry with exponential backoff, and failed jobs are retained for inspection.
 */
@Processor(DAILY_EARNINGS_QUEUE, { concurrency: 1 })
export class DailyEarningsProcessor
  extends WorkerHost
  implements OnModuleInit
{
  private readonly logger = new Logger(DailyEarningsProcessor.name);

  constructor(
    @InjectQueue(DAILY_EARNINGS_QUEUE) private readonly queue: Queue,
    private readonly aggregationService: DailyEarningsAggregationService,
    private readonly metricsService: MetricsService,
    private readonly shutdownService: GracefulShutdownService,
  ) {
    super();
  }

  async onModuleInit(): Promise<void> {
    this.shutdownService.register(this.worker);
    this.shutdownService.registerQueue(this.queue);

    // A fixed jobId keeps the schedule idempotent across restarts and across
    // multiple API instances — re-registering replaces the entry instead of
    // stacking up duplicate nightly runs.
    await this.queue.add(
      DAILY_EARNINGS_JOB,
      {},
      {
        repeat: {
          pattern: DAILY_EARNINGS_CRON,
          tz: DAILY_EARNINGS_TIMEZONE,
        },
        jobId: `${DAILY_EARNINGS_JOB}-recurring`,
        removeOnComplete: 100,
        removeOnFail: 500,
      },
    );

    this.logger.log(
      `Daily earnings aggregation scheduled: "${DAILY_EARNINGS_CRON}" (${DAILY_EARNINGS_TIMEZONE})`,
    );
  }

  async process(job: Job<DailyEarningsJobData>): Promise<void> {
    const jobMetricId = `${DAILY_EARNINGS_QUEUE}:${job.id}`;
    this.logger.log(
      `Processing daily earnings job ${String(job.id)} — attempt ${job.attemptsMade + 1}/${job.opts.attempts ?? 1} ` +
        JSON.stringify({ queue: DAILY_EARNINGS_QUEUE, jobId: job.id, date: job.data?.date }),
    );
    this.metricsService.recordJobStart(jobMetricId);

    try {
      // The scheduled run passes no date and aggregates the day that just
      // ended; an explicit date lets a backfill replay a specific UTC day.
      const requested = job.data?.date ? new Date(job.data.date) : undefined;

      if (requested && Number.isNaN(requested.getTime())) {
        throw new UnrecoverableError(
          `[${DAILY_EARNINGS_QUEUE}:${String(job.id)}] Invalid date in daily earnings job: ${job.data.date}`,
        );
      }

      const result = await this.aggregationService.aggregateDay(requested);

      this.metricsService.recordJobCompletion(jobMetricId, DAILY_EARNINGS_QUEUE, 'success');
      this.logger.log(
        `Daily earnings job ${String(job.id)} finished: ${result.bucketsWritten} bucket(s), ` +
          `${result.earningsProcessed} earning(s), ${result.usersUpdated} user(s) ` +
          JSON.stringify({ queue: DAILY_EARNINGS_QUEUE, jobId: job.id }),
      );
    } catch (error) {
      handleProcessingError(
        this.logger,
        this.metricsService,
        DAILY_EARNINGS_QUEUE,
        job,
        jobMetricId,
        error,
      );
    }
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<DailyEarningsJobData>, error: Error): void {
    handleFailedEvent(this.logger, this.metricsService, DAILY_EARNINGS_QUEUE, job, error, 5000);
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job<DailyEarningsJobData>): void {
    this.logger.log(
      `Daily earnings job ${String(job.id)} completed ` +
        JSON.stringify({ queue: DAILY_EARNINGS_QUEUE, jobId: job.id }),
    );
  }
}
