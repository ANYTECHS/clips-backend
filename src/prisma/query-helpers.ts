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
