import { Prisma } from '@prisma/client';

export interface PaginationOptions {
  page?: number;
  limit?: number;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export function normalizePagination(
  page: number | undefined,
  limit: number | undefined,
  defaults: { page: number; limit: number } = { page: 1, limit: 20 },
): { page: number; limit: number } {
  const normalizedPage = Number.isFinite(page) && Number(page) > 0 ? Number(page) : defaults.page;
  const normalizedLimit = Number.isFinite(limit) && Number(limit) > 0 ? Number(limit) : defaults.limit;

  return {
    page: normalizedPage,
    limit: normalizedLimit,
  };
}

export function buildPaginationArgs(
  page: number | undefined,
  limit: number | undefined,
  maxLimit = 100,
): { page: number; limit: number; skip: number; take: number } {
  const { page: normalizedPage, limit: normalizedLimit } = normalizePagination(page, limit);
  const boundedLimit = Math.min(normalizedLimit, maxLimit);

  return {
    page: normalizedPage,
    limit: boundedLimit,
    skip: (normalizedPage - 1) * boundedLimit,
    take: boundedLimit,
  };
}

export async function paginateQuery<T>(
  listQuery: (args: { skip: number; take: number }) => Promise<T[]>,
  countQuery: () => Promise<number>,
  page?: number,
  limit?: number,
  maxLimit = 100,
): Promise<PaginatedResult<T>> {
  const { page: normalizedPage, limit: normalizedLimit, skip, take } = buildPaginationArgs(
    page,
    limit,
    maxLimit,
  );

  const [items, total] = await Promise.all([listQuery({ skip, take }), countQuery()]);
  const totalPages = total === 0 ? 0 : Math.ceil(total / normalizedLimit);

  return {
    items,
    total,
    page: normalizedPage,
    limit: normalizedLimit,
    totalPages,
    hasNextPage: normalizedPage < totalPages,
    hasPreviousPage: normalizedPage > 1 && total > 0,
  };
}

export type QuerySelect<T> = Prisma.UserSelect | Prisma.ClipSelect | Prisma.EarningSelect | Prisma.PayoutSelect;

/**
 * Standardized pagination query parameters (Issue #1237).
 * Documented in Swagger as `page` (1-based) + `limit` (1–100, default 20).
 */
export interface StandardPaginationParams {
  page?: number;
  limit?: number;
}

export const PAGINATION_DEFAULTS = { page: 1, limit: 20 } as const;
export const PAGINATION_MAX_LIMIT = 100;

/**
 * Reusable `earning` ownership filter (Issue #1237).
 * Consolidates ~12 copies of `{ clip: { video: { userId } }, deletedAt: null }`.
 */
export function userEarningsWhere(userId: number): Prisma.EarningWhereInput {
  return { clip: { video: { userId } }, deletedAt: null };
}

/**
 * Reusable `clip` ownership include (Issue #1237).
 * Consolidates ~10 copies of `include/select: { video: { select: { userId } } }`.
 */
export const clipOwnerInclude = {
  video: { select: { userId: true } },
} as const;

/**
 * Canonical `payout` list select (Issue #1237).
 * Single source of truth for the 16-field payout projection previously
 * copy-pasted across `getPayouts/getPayoutById/getOnChainStatus/receipt/cancel`.
 */
export const payoutListSelect = {
  id: true,
  amount: true,
  currency: true,
  method: true,
  status: true,
  transactionId: true,
  onChainTxHash: true,
  confirmedAt: true,
  retryCount: true,
  stellarXdr: true,
  feeAmount: true,
  feePercentage: true,
  finalAmount: true,
  paidAt: true,
  approvedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

/** Extended payout select including moderation fields for admin/detail views. */
export const payoutDetailSelect = {
  ...payoutListSelect,
  approvedBy: true,
  rejectedAt: true,
  rejectionReason: true,
} as const;

/**
 * Canonical `clip` list select (Issue #1237).
 * Explicit projection — never `include: { video: true }` or other broad
 * includes that load entire relation sub-trees.
 */
export const clipListSelect = {
  id: true,
  videoId: true,
  clipUrl: true,
  thumbnail: true,
  platform: true,
  title: true,
  caption: true,
  startTime: true,
  endTime: true,
  duration: true,
  viralityScore: true,
  royaltyBps: true,
  selected: true,
  postStatus: true,
  postedAt: true,
  metadataUri: true,
  mintAddress: true,
  mintedAt: true,
  nftStatus: true,
  status: true,
  localFilePath: true,
  error: true,
  createdAt: true,
  updatedAt: true,
} as const;
