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
