import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface PlatformBreakdown {
  [platform: string]: number;
}

export interface EarningsSummary {
  totalAmount: number;
  currency: string;
  platformBreakdown: PlatformBreakdown;
}

/**
 * EarningsService — aggregates, caches, and summarises user earnings.
 * Used by webhooks, payouts, and the monthly cron.
 */
@Injectable()
export class EarningsService {
  private readonly logger = new Logger(EarningsService.name);

  /** Simple in-memory cache keyed by userId */
  private readonly cache = new Map<number, { data: EarningsSummary; ts: number }>();
  private readonly cacheTtlMs = 5 * 60 * 1000; // 5 minutes

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get aggregated earnings for a user (with short-lived cache).
   */
  async getUserEarnings(userId: number): Promise<EarningsSummary> {
    const cached = this.cache.get(userId);
    if (cached && Date.now() - cached.ts < this.cacheTtlMs) {
      return cached.data;
    }

    const result = await this.aggregateEarnings(userId);
    this.cache.set(userId, { data: result, ts: Date.now() });
    return result;
  }

  /**
   * Invalidate the in-memory cache for a user.
   * Called after a new earning is created so the next read reflects the change.
   */
  invalidateUserEarningsCache(userId: number): void {
    this.cache.delete(userId);
    this.logger.debug(`Earnings cache invalidated for user ${userId}`);
  }

  /**
   * Aggregate earnings for a specific user within an optional date range.
   */
  async aggregateEarnings(
    userId: number,
    from?: Date,
    to?: Date,
  ): Promise<EarningsSummary> {
    const earnings = await this.prisma.earning.findMany({
      where: {
        clip: { video: { userId } },
        deletedAt: null,
        ...(from || to
          ? {
              date: {
                ...(from ? { gte: from } : {}),
                ...(to ? { lte: to } : {}),
              },
            }
          : {}),
      },
      include: { clip: true },
    });

    const totalAmount = earnings.reduce((sum, e) => sum + e.amount, 0);
    const platformBreakdown: PlatformBreakdown = {};

    for (const earning of earnings) {
      const platform = earning.clip.platform ?? 'unknown';
      platformBreakdown[platform] = (platformBreakdown[platform] ?? 0) + earning.amount;
    }

    return { totalAmount, currency: 'USD', platformBreakdown };
  }

  /**
   * Get all distinct user IDs that have earnings records.
   */
  async getActiveUserIds(): Promise<number[]> {
    const rows = await this.prisma.earning.findMany({
      where: { deletedAt: null },
      distinct: ['clipId'],
      include: { clip: { include: { video: true } } },
    });

    const ids = new Set<number>();
    for (const row of rows) {
      ids.add(row.clip.video.userId);
    }
    return Array.from(ids);
  }
}
