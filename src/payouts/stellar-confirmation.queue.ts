export const STELLAR_CONFIRMATION_QUEUE = 'stellar-confirmation';
export const STELLAR_CONFIRMATION_JOB = 'poll-stellar-confirmations';

export const STELLAR_CONFIRMATION_INTERVAL_MS = parseInt(
  process.env.STELLAR_CONFIRMATION_INTERVAL_MS ?? '30000',
  10,
);

export const STELLAR_CONFIRMATION_MAX_POLLS = parseInt(
  process.env.STELLAR_CONFIRMATION_MAX_POLLS ?? '20',
  10,
);

/**
 * Retry policy for Stellar confirmation polls (Issue #1235).
 * Polling is idempotent, so transient Horizon/RPC failures are retryable.
 * Failed polls are retained for inspection via `GET /jobs/failed`.
 */
export const STELLAR_CONFIRMATION_JOB_OPTIONS = {
  attempts: 3,
  backoff: {
    type: 'exponential' as const,
    delay: 5000,
  },
  removeOnComplete: 100,
  removeOnFail: 500,
} as const;
