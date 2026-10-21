/**
 * Queue and schedule constants for the daily earnings aggregation job
 * (Issue #767).
 */

export const DAILY_EARNINGS_QUEUE = 'daily-earnings-aggregation';

export const DAILY_EARNINGS_JOB = 'aggregate-daily-earnings';

/**
 * Cron expression for the repeatable job. Defaults to midnight, and is always
 * evaluated in UTC (see DAILY_EARNINGS_TIMEZONE) so the day boundary matches
 * the boundary the aggregation itself uses.
 */
export const DAILY_EARNINGS_CRON =
  process.env.DAILY_EARNINGS_CRON ?? '0 0 * * *';

/**
 * Timezone the cron expression is evaluated in. Fixed to UTC: earnings are
 * bucketed by UTC day, so running the job on a local-time midnight would
 * either double-count or skip a day whenever the server's offset changed.
 */
export const DAILY_EARNINGS_TIMEZONE = 'UTC';

/** Rows pulled from the Earning table per page while aggregating. */
export const DAILY_EARNINGS_PAGE_SIZE = parseInt(
  process.env.DAILY_EARNINGS_PAGE_SIZE ?? '1000',
  10,
);

export interface DailyEarningsJobData {
  /**
   * ISO date (YYYY-MM-DD) of the UTC day to aggregate. Omitted on the
   * scheduled run, which aggregates the day that just ended.
   */
  date?: string;
}

/**
 * Retry policy for the daily aggregation job (Issue #1235).
 * Validation failures (e.g. invalid date) are thrown as `UnrecoverableError`
 * and skip retries; transient DB failures retry with exponential backoff.
 * Failed jobs are retained for inspection (`removeOnFail: 500` on the
 * repeatable schedule entry).
 */
export const DAILY_EARNINGS_JOB_OPTIONS = {
  attempts: 3,
  backoff: {
    type: 'exponential' as const,
    delay: 5000,
  },
  removeOnComplete: 100,
  removeOnFail: 500,
} as const;
