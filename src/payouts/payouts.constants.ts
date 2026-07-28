export const PAYOUT_FILTER_STATUSES = [
  'pending',
  'pending_approval',
  'approved',
  'completed',
  'failed',
  'rejected',
] as const;

export type PayoutFilterStatus = (typeof PAYOUT_FILTER_STATUSES)[number];
