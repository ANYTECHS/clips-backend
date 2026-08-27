import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, OnModuleInit } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { DailyEarningsAggregationService } from './daily-earnings-aggregation.service';
import {
  DAILY_EARNINGS_CRON,
  DAILY_EARNINGS_JOB,
  DAILY_EARNINGS_QUEUE,
  DAILY_EARNINGS_TIMEZONE,
  DailyEarningsJobData,
} from './daily-earnings.queue';

/**
 * Repeatable BullMQ job that rolls the previous UTC day's earnings up into
 * `DailyEarning` and refreshes each affected user's summary (Issue #767).
 *
 * Concurrency is pinned to 1: two overlapping runs would upsert the same
 * `(userId, date, currency)` rows and race on the summary recomputation.
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
  ) {
    super();
  }

  async onModuleInit(): Promise<void> {
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
    // The scheduled run passes no date and aggregates the day that just
    // ended; an explicit date lets a backfill replay a specific UTC day.
    const requested = job.data?.date ? new Date(job.data.date) : undefined;

    if (requested && Number.isNaN(requested.getTime())) {
      throw new Error(`Invalid date in daily earnings job: ${job.data.date}`);
    }

    const result = await this.aggregationService.aggregateDay(requested);

    this.logger.log(
      `Daily earnings job ${job.id} finished: ${result.bucketsWritten} bucket(s), ` +
        `${result.earningsProcessed} earning(s), ${result.usersUpdated} user(s)`,
    );
  }
}
