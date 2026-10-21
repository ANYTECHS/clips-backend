import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { userEarningsWhere } from '../query-helpers';

/**
 * Centralized Earning queries (Issue #1237).
 * Consolidates ~12 copies of the base filter
 * `{ clip: { video: { userId } }, deletedAt: null }` and the balance triple
 * (`earning.aggregate + payout.aggregate`) previously recomputed in
 * `EarningsService`, `EarningsGateway`, `BalanceService`, and `PayoutsService`.
 */
@Injectable()
export class EarningRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Base ownership filter for a user's visible earnings. */
  whereForUser(userId: number, extra: Prisma.EarningWhereInput = {}): Prisma.EarningWhereInput {
    return { ...userEarningsWhere(userId), ...extra };
  }

  async sumForUser(userId: number): Promise<number> {
    const result = await this.prisma.earning.aggregate({
      where: userEarningsWhere(userId),
      _sum: { amount: true },
    });
    return result._sum.amount ?? 0;
  }

  async sumBaseCurrencyForUser(userId: number): Promise<number> {
    const result = await this.prisma.earning.aggregate({
      where: userEarningsWhere(userId),
      _sum: { amountInBaseCurrency: true },
    });
    return (result._sum as { amountInBaseCurrency?: number | null }).amountInBaseCurrency ?? 0;
  }

  async recentForUser(
    userId: number,
    take = 10,
  ): Promise<
    Pick<Prisma.EarningGetPayload<{ select: { id: true; amount: true; currency: true; date: true; source: true } }>, 'id' | 'amount' | 'currency' | 'date' | 'source'>[]
  > {
    return this.prisma.earning.findMany({
      where: userEarningsWhere(userId),
      take,
      orderBy: { date: 'desc' },
      select: { id: true, amount: true, currency: true, date: true, source: true },
    }) as Promise<
      Pick<Prisma.EarningGetPayload<{ select: { id: true; amount: true; currency: true; date: true; source: true } }>, 'id' | 'amount' | 'currency' | 'date' | 'source'>[]
    >;
  }
}
