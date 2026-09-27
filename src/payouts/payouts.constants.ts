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
