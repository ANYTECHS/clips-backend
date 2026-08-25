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
  }
}
