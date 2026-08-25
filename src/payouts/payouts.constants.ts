export const PAYOUT_STATUSES = {
  PENDING: 'pending',
  PENDING_REVIEW: 'pending_review',
  PENDING_APPROVAL: 'pending_approval',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELED: 'canceled',
} as const;

export const PAYOUT_FILTER_STATUSES = [
  'pending',
  'pending_review',
  'pending_approval',
  'approved',
  'completed',
  'failed',
  'rejected',
] as const;

export const OPEN_PAYOUT_STATUSES = [
  'pending',
  'pending_review',
  'pending_approval',
  'approved',
  'processing',
] as const;

export type PayoutFilterStatus = (typeof PAYOUT_FILTER_STATUSES)[number];
