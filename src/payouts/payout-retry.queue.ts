export const PAYOUT_RETRY_QUEUE = 'payout-retry';

/**
 * Payout operations require critical priority (1) in BullMQ,
 * ensuring financial transactions take precedence over ordinary background processing.
 */
export const PAYOUT_RETRY_QUEUE_PRIORITY = 1;

export const MAX_PAYOUT_RETRIES = 3;

export const PAYOUT_RETRY_BACKOFF_BASE = 60; // seconds

export const PAYOUT_RETRY_JOB_OPTIONS = {
  attempts: MAX_PAYOUT_RETRIES,
  backoff: {
    type: 'exponential' as const,
    delay: PAYOUT_RETRY_BACKOFF_BASE * 1000,
  },
  priority: PAYOUT_RETRY_QUEUE_PRIORITY,
  removeOnComplete: 1000,
  removeOnFail: 5000,
} as const;
