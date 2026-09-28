export const PAYOUT_STATUSES = {
  PENDING: 'pending',
  UNDER_REVIEW: 'under_review',
  /** @deprecated Prefer UNDER_REVIEW — kept for backward compatibility */
  PENDING_REVIEW: 'pending_review',
  PENDING_APPROVAL: 'pending_approval',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELED: 'canceled',
  CANCELLED: 'cancelled',
} as const;

/** Maximum number of payout IDs accepted by the admin bulk process endpoint. */
export const MAX_BULK_PAYOUT_BATCH_SIZE = 50;

/** User-facing statuses documented in #984 (+ review/approval lifecycle from #988). */
export const PAYOUT_FILTER_STATUSES = [
  'pending',
  'under_review',
  'pending_review',
  'pending_approval',
  'approved',
  'processing',
  'completed',
  'failed',
  'rejected',
  'canceled',
  'cancelled',
] as const;

export const OPEN_PAYOUT_STATUSES = [
  'pending',
  'under_review',
  'pending_review',
  'pending_approval',
  'approved',
  'processing',
] as const;

export type PayoutFilterStatus = (typeof PAYOUT_FILTER_STATUSES)[number];

/** Normalize API aliases (cancelled → canceled, under_review ↔ pending_review). */
export function normalizePayoutStatusFilter(status?: string): string | undefined {
  if (!status) return undefined;
  if (status === 'cancelled') return 'canceled';
  return status;
}

/** Statuses that match a filter, including synonyms. */
export function expandStatusFilter(status: string): string[] {
  const normalized = normalizePayoutStatusFilter(status)!;
  if (normalized === 'under_review' || normalized === 'pending_review') {
    return ['under_review', 'pending_review'];
  }
  if (normalized === 'canceled') {
    return ['canceled', 'cancelled'];
  }
  return [normalized];
}
export type PayoutStatusValue =
  (typeof PAYOUT_STATUSES)[keyof typeof PAYOUT_STATUSES];

export const PAYOUT_STATUS_VALUES = Object.values(
  PAYOUT_STATUSES,
) as PayoutStatusValue[];

/**
 * Status groups used to gate payout lifecycle actions. Validation and
 * processing both read from here so the allowed states for each action are
 * defined in exactly one place.
 */
export const CANCELABLE_PAYOUT_STATUSES = [
  'pending',
  'pending_review',
  'pending_approval',
] as const;

export const STELLAR_INITIABLE_PAYOUT_STATUSES = [
  'approved',
  'pending',
  'pending_review',
] as const;

/** Statuses counted against a user's balance in the legacy full-balance flow. */
export const PAID_OUT_PAYOUT_STATUSES = ['completed', 'processing'] as const;

/** Statuses surfaced in the admin approval queue. */
export const ADMIN_PENDING_PAYOUT_STATUSES = [
  'pending_approval',
  'approved',
] as const;

/** Stellar payouts in these statuses are polled until Horizon confirms them. */
export const UNCONFIRMED_STELLAR_PAYOUT_STATUSES = [
  'pending',
  'processing',
] as const;

/** Human-readable meaning of each status, surfaced in Swagger. */
export const PAYOUT_STATUS_DESCRIPTIONS: Record<PayoutStatusValue, string> = {
  pending:
    'Created, or an unsigned Stellar XDR has been prepared and is awaiting signature/submission.',
  pending_review:
    'Amount is at or above PAYOUT_APPROVAL_THRESHOLD and is waiting for an admin review.',
  pending_approval: 'Waiting for an admin approval (legacy review state).',
  approved: 'Approved and ready to be submitted to the Stellar network.',
  processing:
    'Transaction has been submitted to Stellar and is awaiting on-chain confirmation from Horizon.',
  completed:
    'Transaction confirmed successful on-chain; onChainTxHash and confirmedAt are set.',
  failed:
    'Submission or on-chain verification failed. Failed attempts are retried with exponential backoff until MAX_PAYOUT_RETRIES is reached.',
  rejected: 'Rejected by an admin; rejectionReason is set.',
  canceled: 'Canceled by the user before approval.',
};

export const PAYOUT_STATUS_SWAGGER_DESCRIPTION =
  'Payout lifecycle status. Stellar transaction states:\n' +
  PAYOUT_STATUS_VALUES.map(
    (status) => `- \`${status}\`: ${PAYOUT_STATUS_DESCRIPTIONS[status]}`,
  ).join('\n');
