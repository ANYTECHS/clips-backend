import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { PaginatedResult, paginateQuery, payoutDetailSelect, payoutListSelect } from '../query-helpers';

export type PayoutListItem = Prisma.PayoutGetPayload<{ select: typeof payoutListSelect }>;
export type PayoutDetailItem = Prisma.PayoutGetPayload<{ select: typeof payoutDetailSelect }>;

/**
 * Centralized Payout queries (Issue #1237).
 * Single source of truth for the 16-field payout projection and the
 * paginated `getPayouts` query. Pagination responses remain compatible with
 * `PaginatedResponseDto(items, total, page, limit)`.
 */
@Injectable()
export class PayoutRepository {
  constructor(private readonly prisma: PrismaService) {}

  buildWhere(userId: number, statusIn?: string[]): Prisma.PayoutWhereInput {
    return {
      userId,
      ...(statusIn && statusIn.length > 0 ? { status: { in: statusIn } } : {}),
    };
  }

  async list(
    where: Prisma.PayoutWhereInput,
    page?: number,
    limit?: number,
  ): Promise<PaginatedResult<PayoutDetailItem>> {
    return paginateQuery<PayoutDetailItem>(
      ({ skip, take }) =>
        this.prisma.payout.findMany({
          where,
          select: payoutDetailSelect,
          orderBy: { createdAt: 'desc' },
          skip,
          take,
        }) as Promise<PayoutDetailItem[]>,
      () => this.prisma.payout.count({ where }),
      page,
      limit,
    );
  }

  async findByIdForUser(userId: number, payoutId: number): Promise<PayoutDetailItem | null> {
    return this.prisma.payout.findFirst({
      where: { id: payoutId, userId },
      select: payoutDetailSelect,
    }) as Promise<PayoutDetailItem | null>;
  }
}
