import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface EarningsBreakdown {
  platform: string;
  total: number;
  currency: string;
}

export interface MonthlyEarningsResult {
  year: number;
  month: number;
  total: number;
  currency: string;
  breakdown: EarningsBreakdown[];
}
import { Currency, EarningsBreakdown } from './earnings.types';
import { CurrencyConversionService } from './currency-conversion.service';
import { RedisService } from '../redis/redis.service';
import { ConfigService } from '../config/config.service';

@Injectable()
export class EarningsAggregationService {
  private readonly logger = new Logger(EarningsAggregationService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Aggregates earnings by month for a given user.
   */
  async getMonthlyEarnings(
    userId: number,
    year: number,
    month: number,
  ): Promise<MonthlyEarningsResult> {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59, 999);

    const rows = await this.prisma.earning.findMany({
      where: {
        clip: { video: { userId } },
        deletedAt: null,
        date: { gte: startDate, lte: endDate },
      },
      select: { amount: true, source: true, currency: true },
    });

    let total = 0;
    const platformMap = new Map<string, number>();
    let currency = 'USD';

    for (const row of rows) {
      total += row.amount;
      currency = row.currency ?? 'USD';
      const platform = row.source ?? 'unknown';
      platformMap.set(platform, (platformMap.get(platform) ?? 0) + row.amount);
    }

    const breakdown: EarningsBreakdown[] = Array.from(platformMap.entries()).map(
      ([platform, amount]) => ({ platform, total: amount, currency }),
    );

    return { year, month, total, currency, breakdown };
  }

  /**
   * Returns the top N earners (userId + total) for the public leaderboard.
   */
  async getLeaderboard(limit = 10): Promise<Array<{ userId: number; total: number }>> {
    const rows = await this.prisma.earning.groupBy({
      by: ['clipId'],
      where: { deletedAt: null },
      _sum: { amount: true },
      orderBy: { _sum: { amount: 'desc' } },
      take: limit * 5, // over-fetch because we group by clip, not user
    });

    // Resolve clip → user
    const clipIds = rows.map((r) => r.clipId);
    const clips = await this.prisma.clip.findMany({
      where: { id: { in: clipIds } },
      select: { id: true, video: { select: { userId: true } } },
    });
    const clipUserMap = new Map(clips.map((c) => [c.id, c.video.userId]));

    const userTotals = new Map<number, number>();
    for (const row of rows) {
      const uid = clipUserMap.get(row.clipId);
      if (uid !== undefined) {
        userTotals.set(uid, (userTotals.get(uid) ?? 0) + (row._sum.amount ?? 0));
      }
    }

    return Array.from(userTotals.entries())
      .map(([userId, total]) => ({ userId, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, limit);
  constructor(
    private prisma: PrismaService,
    private currencyConversion: CurrencyConversionService,
    private redisService: RedisService,
    private config: ConfigService,
  ) {}

  private getCacheKey(userId: number, targetCurrency: Currency): string {
    return `earnings:user:${userId}:total:${targetCurrency}`;
  }

  public async invalidateUserEarningsCache(userId: number): Promise<void> {
    const currencies = Object.values(Currency);
    for (const currency of currencies) {
      const key = this.getCacheKey(userId, currency);
      await this.redisService.del(key);
    }
  }

  private userEarningsWhere(userId: number) {
    return {
      clip: { video: { userId } },
      deletedAt: null,
    };
  }

  private validatePeriod(startDate: Date, endDate: Date) {
    if (startDate > endDate) {
      throw new Error('Start date must be before end date');
    }
  }

  public aggregateEarnings(
    earnings: Array<{ amount: number; currency: string; source: string | null }>,
    targetCurrency: Currency = Currency.USD,
  ): { total: number; breakdown: EarningsBreakdown } {
    let total = 0;
    let royalties = 0;
    let subscriptions = 0;

    for (const e of earnings) {
      const convertedAmount = this.currencyConversion.convert(
        e.amount,
        (e.currency as Currency) || Currency.USD,
        targetCurrency,
      );

      total += convertedAmount;

      if (e.source === 'royalty') {
        royalties += convertedAmount;
      } else if (e.source === 'subscription') {
        subscriptions += convertedAmount;
      }
    }

    return { total, breakdown: { royalties, subscriptions } };
  }

  async getUserTotalEarnings(
    userId: number,
    targetCurrency: Currency = Currency.USD,
  ) {
    const cacheKey = this.getCacheKey(userId, targetCurrency);

    const cached = await this.redisService.get(cacheKey);
    if (cached) {
      this.logger.log(`Cache hit for user ${userId} earnings total in ${targetCurrency}`);
      return JSON.parse(cached);
    }

    this.logger.log(`Cache miss for user ${userId} earnings total in ${targetCurrency}`);
    const earnings = await this.prisma.$transaction((tx) =>
      tx.earning.findMany({
        where: this.userEarningsWhere(userId),
        select: { amount: true, currency: true, source: true },
      }),
    );

    const aggregated = this.aggregateEarnings(earnings, targetCurrency);
    const result = {
      ...aggregated,
      currency: targetCurrency,
    };

    await this.redisService.setex(cacheKey, this.config.earningsCacheTtlSeconds, JSON.stringify(result));

    return result;
  }

  async getEarningsByPeriod(
    userId: number,
    startDate: Date,
    endDate: Date,
    targetCurrency: Currency = Currency.USD,
  ) {
    this.validatePeriod(startDate, endDate);

    const periodEnd = new Date(endDate);
    periodEnd.setUTCHours(23, 59, 59, 999);

    const earnings = await this.prisma.$transaction((tx) =>
      tx.earning.findMany({
        where: {
          ...this.userEarningsWhere(userId),
          date: { gte: startDate, lte: periodEnd },
        },
        select: {
          id: true,
          amount: true,
          currency: true,
          source: true,
          date: true,
          clip: { select: { title: true } },
        },
        orderBy: { date: 'desc' },
      }),
    );

    const aggregated = this.aggregateEarnings(earnings, targetCurrency);

    return {
      startDate: startDate.toISOString(),
      endDate: periodEnd.toISOString(),
      total: aggregated.total,
      currency: targetCurrency,
      breakdown: aggregated.breakdown,
      items: earnings.map((earning) => {
        const convertedAmount = this.currencyConversion.convert(
          earning.amount,
          (earning.currency as Currency) || Currency.USD,
          targetCurrency,
        );
        return {
          id: earning.id,
          amount: convertedAmount,
          currency: targetCurrency,
          source: earning.source,
          date: earning.date.toISOString(),
          clipTitle: earning.clip.title,
        };
      }),
    };
  }

  async getEarningsDashboard(
    userId: number,
    page = 1,
    limit = 20,
    targetCurrency: Currency = Currency.USD,
  ) {
    const earnings = await this.prisma.earning.findMany({
      where: { clip: { video: { userId } }, deletedAt: null },
      select: { amount: true, currency: true, source: true, date: true },
    });

    const aggregated = this.aggregateEarnings(earnings, targetCurrency);
    const totalEarned = aggregated.total;

    const payouts = await this.prisma.payout.findMany({
      where: { userId },
      select: { amount: true, currency: true, status: true, createdAt: true },
    });

    const paidOut = payouts
      .filter((p) => p.status === 'completed')
      .reduce((sum, p) => sum + this.currencyConversion.convert(
        p.amount,
        (p.currency as Currency) || Currency.USD,
        targetCurrency,
      ), 0);

    const pendingPayout = payouts
      .filter((p) => p.status === 'pending' || p.status === 'processing')
      .reduce((sum, p) => sum + this.currencyConversion.convert(
        p.amount,
        (p.currency as Currency) || Currency.USD,
        targetCurrency,
      ), 0);

    const historyItems: any[] = [
      ...earnings.map((e) => ({
        date: e.date.toISOString(),
        amount: this.currencyConversion.convert(
          e.amount,
          (e.currency as Currency) || Currency.USD,
          targetCurrency,
        ),
        currency: targetCurrency,
        type: e.source as 'royalty' | 'subscription',
      })),
      ...payouts.map((p) => ({
        date: p.createdAt.toISOString(),
        amount: this.currencyConversion.convert(
          p.amount,
          (p.currency as Currency) || Currency.USD,
          targetCurrency,
        ),
        currency: targetCurrency,
        type: 'payout' as const,
      })),
    ];

    historyItems.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    );

    const start = (page - 1) * limit;
    const paginatedHistory = historyItems.slice(start, start + limit);

    return {
      totalEarned,
      currency: targetCurrency,
      pendingPayout,
      paidOut,
      breakdown: aggregated.breakdown,
      history: paginatedHistory,
    };
  }

  async getLeaderboard(limit = 10) {
    const enabled = this.config.leaderboardEnabled;
    if (!enabled) {
      return [];
    }

    const earnings = await this.prisma.earning.findMany({
      where: { deletedAt: null },
      select: {
        amount: true,
        currency: true,
        clip: { select: { video: { select: { userId: true } } } },
      },
    });

    const totals = new Map<number, number>();
    for (const e of earnings) {
      const uid = e.clip.video.userId;
      const convertedAmount = this.currencyConversion.convert(
        e.amount,
        (e.currency as Currency) || Currency.USD,
        Currency.USD,
      );
      totals.set(uid, (totals.get(uid) ?? 0) + convertedAmount);
    }

    const sorted = Array.from(totals.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit);

    return sorted.map(([, total], index) => ({
      rank: index + 1,
      label: `Creator #${index + 1}`,
      totalEarned: total,
    }));
  }

  async getEarningsByPlatform(userId: number) {
    const earnings = await this.prisma.earning.findMany({
      where: {
        clip: { video: { userId } },
        deletedAt: null,
      },
      select: {
        amount: true,
        source: true,
      },
    });

    const platformMap = new Map<string, { total: number; count: number }>();
    let totalEarnings = 0;

    for (const earning of earnings) {
      const platform = earning.source || 'unknown';
      const current = platformMap.get(platform) || { total: 0, count: 0 };

      platformMap.set(platform, {
        total: current.total + earning.amount,
        count: current.count + 1,
      });

      totalEarnings += earning.amount;
    }

    const data = Array.from(platformMap.entries())
      .map(([platform, stats]) => ({
        platform,
        totalEarnings: stats.total,
        count: stats.count,
      }))
      .sort((a, b) => b.totalEarnings - a.totalEarnings);

    return {
      data,
      totalEarnings,
    };
  }

  async softDelete(earningId: number, userId: number) {
    const earning = await this.prisma.earning.findUnique({
      where: { id: earningId },
      include: { clip: { include: { video: { select: { userId: true } } } } },
    });

    if (!earning || earning.clip.video.userId !== userId) {
      throw new Error(`Earning ${earningId} not found`);
    }

    if (earning.deletedAt !== null) {
      throw new Error(`Earning ${earningId} not found`);
    }

    await this.prisma.earning.update({
      where: { id: earningId },
      data: { deletedAt: new Date() },
    });

    await this.invalidateUserEarningsCache(userId);
    this.logger.log(`Soft-deleted earning ${earningId} for user ${userId} and invalidated cache`);

    return { message: 'Earning deleted successfully' };
  }
}
