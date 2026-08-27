import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { DAILY_EARNINGS_PAGE_SIZE } from './daily-earnings.queue';

/** Result of aggregating a single UTC day. */
export interface DailyAggregationResult {
  /** Midnight UTC of the day that was aggregated. */
  date: Date;
  /** Number of DailyEarning rows written (one per user per currency). */
  bucketsWritten: number;
  /** Number of Earning rows folded into those buckets. */
  earningsProcessed: number;
  /** Number of users whose lifetime summary was refreshed. */
  usersUpdated: number;
}

/** One user+currency bucket accumulated in memory before it is written. */
interface Bucket {
  userId: number;
  currency: string;
  totalAmount: number;
  totalInBaseCurrency: number;
  hasBaseCurrency: boolean;
  earningCount: number;
  clipIds: Set<number>;
}

/**
 * Returns midnight UTC of the day the given instant falls in.
 *
 * Everything in this service is bucketed on UTC day boundaries: `Date.UTC`
 * avoids the host's local offset, so the same earning lands in the same bucket
 * regardless of where the worker runs or whether DST just shifted.
 */
export function startOfUtcDay(instant: Date): Date {
  return new Date(
    Date.UTC(
      instant.getUTCFullYear(),
      instant.getUTCMonth(),
      instant.getUTCDate(),
    ),
  );
}

/** Returns midnight UTC of the day before the given instant's UTC day. */
export function previousUtcDay(instant: Date): Date {
  const start = startOfUtcDay(instant);
  return new Date(start.getTime() - 24 * 60 * 60 * 1000);
}

/**
 * Aggregates per-clip earnings into per-user daily totals (Issue #767).
 *
 * Earnings are stored one row per clip, which makes the dashboard's "what did
 * I earn" query a full scan joined through Clip and Video. This service rolls
 * each UTC day up into `DailyEarning` (per user, per currency) and refreshes
 * the denormalised `UserEarningsSummary`, so those reads become a single
 * indexed lookup.
 */
@Injectable()
export class DailyEarningsAggregationService {
  private readonly logger = new Logger(DailyEarningsAggregationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Aggregate one UTC day.
   *
   * @param day Any instant within the day to aggregate; defaults to the UTC
   *   day that just ended, which is what the midnight scheduled run wants.
   */
  async aggregateDay(day?: Date): Promise<DailyAggregationResult> {
    const date = day ? startOfUtcDay(day) : previousUtcDay(new Date());
    const nextDate = new Date(date.getTime() + 24 * 60 * 60 * 1000);

    this.logger.log(
      `Aggregating earnings for ${date.toISOString().slice(0, 10)} (UTC)`,
    );

    const buckets = await this.collectBuckets(date, nextDate);
    const earningsProcessed = [...buckets.values()].reduce(
      (sum, bucket) => sum + bucket.earningCount,
      0,
    );

    await this.writeBuckets(date, buckets);

    const userIds = [...new Set([...buckets.values()].map((b) => b.userId))];
    await this.refreshSummaries(userIds);

    this.logger.log(
      `Aggregated ${earningsProcessed} earning(s) into ${buckets.size} bucket(s) ` +
        `across ${userIds.length} user(s) for ${date.toISOString().slice(0, 10)}`,
    );

    return {
      date,
      bucketsWritten: buckets.size,
      earningsProcessed,
      usersUpdated: userIds.length,
    };
  }

  /**
   * Page through the day's earnings, grouping by user and currency.
   *
   * Grouping happens in memory rather than via `groupBy` because the user is
   * two relations away (Earning -> Clip -> Video.userId), which Prisma cannot
   * group on. Paging keeps a busy day from being loaded all at once.
   */
  private async collectBuckets(
    from: Date,
    to: Date,
  ): Promise<Map<string, Bucket>> {
    const buckets = new Map<string, Bucket>();
    let cursor: number | undefined;

    for (;;) {
      const page = await this.prisma.earning.findMany({
        where: {
          date: { gte: from, lt: to },
          deletedAt: null,
        },
        select: {
          id: true,
          clipId: true,
          amount: true,
          currency: true,
          amountInBaseCurrency: true,
          clip: { select: { video: { select: { userId: true } } } },
        },
        orderBy: { id: 'asc' },
        take: DAILY_EARNINGS_PAGE_SIZE,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });

      if (page.length === 0) {
        break;
      }

      for (const earning of page) {
        const userId = earning.clip?.video?.userId;
        if (userId === undefined || userId === null) {
          // Orphaned earning (clip or video removed mid-flight) — nothing to
          // attribute it to, so leave it out rather than guessing.
          this.logger.warn(
            `Earning ${earning.id} has no owning user; excluded from aggregation`,
          );
          continue;
        }

        const currency = (earning.currency ?? 'USD').toUpperCase();
        const key = `${userId}:${currency}`;
        const bucket = buckets.get(key) ?? {
          userId,
          currency,
          totalAmount: 0,
          totalInBaseCurrency: 0,
          hasBaseCurrency: false,
          earningCount: 0,
          clipIds: new Set<number>(),
        };

        bucket.totalAmount += earning.amount ?? 0;
        if (
          earning.amountInBaseCurrency !== null &&
          earning.amountInBaseCurrency !== undefined
        ) {
          bucket.totalInBaseCurrency += earning.amountInBaseCurrency;
          bucket.hasBaseCurrency = true;
        }
        bucket.earningCount += 1;
        bucket.clipIds.add(earning.clipId);

        buckets.set(key, bucket);
      }

      if (page.length < DAILY_EARNINGS_PAGE_SIZE) {
        break;
      }
      cursor = page[page.length - 1].id;
    }

    return buckets;
  }

  /**
   * Upsert each bucket so a re-run for the same day overwrites rather than
   * duplicates. That makes the job safe to replay — after an outage, or when
   * late earnings arrive for a day already aggregated.
   */
  private async writeBuckets(
    date: Date,
    buckets: Map<string, Bucket>,
  ): Promise<void> {
    for (const bucket of buckets.values()) {
      const row = {
        totalAmount: round2(bucket.totalAmount),
        totalInBaseCurrency: bucket.hasBaseCurrency
          ? round2(bucket.totalInBaseCurrency)
          : null,
        earningCount: bucket.earningCount,
        clipCount: bucket.clipIds.size,
      };

      await this.prisma.dailyEarning.upsert({
        where: {
          userId_date_currency: {
            userId: bucket.userId,
            date,
            currency: bucket.currency,
          },
        },
        update: row,
        create: {
          userId: bucket.userId,
          date,
          currency: bucket.currency,
          ...row,
        },
      });
    }
  }

  /**
   * Recompute each affected user's lifetime totals into UserEarningsSummary
   * and drop the cached summary so the next read picks up fresh numbers.
   */
  private async refreshSummaries(userIds: number[]): Promise<void> {
    for (const userId of userIds) {
      try {
        const [earned, paidOut] = await Promise.all([
          this.prisma.earning.aggregate({
            where: { clip: { video: { userId } }, deletedAt: null },
            _sum: { amount: true },
          }),
          this.prisma.payout.aggregate({
            where: { userId, status: { in: ['completed', 'processing'] } },
            _sum: { amount: true },
          }),
        ]);

        const totalEarned = round2(earned._sum.amount ?? 0);
        const totalPaidOut = round2(paidOut._sum.amount ?? 0);
        const summary = {
          totalEarned,
          totalPaidOut,
          availableBalance: round2(totalEarned - totalPaidOut),
          lastAggregatedAt: new Date(),
        };

        await this.prisma.userEarningsSummary.upsert({
          where: { userId },
          update: summary,
          create: { userId, ...summary },
        });

        await this.invalidateSummaryCache(userId);
      } catch (error) {
        // One user's summary failing must not abandon the rest of the run;
        // the next nightly pass recomputes from scratch anyway.
        this.logger.error(
          `Failed to refresh earnings summary for user ${userId}: ` +
            `${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  /**
   * Drop the Redis key `EarningsService.getUserTotalEarnings` reads, so the
   * dashboard does not keep serving pre-aggregation totals for up to the full
   * cache TTL.
   */
  private async invalidateSummaryCache(userId: number): Promise<void> {
    try {
      await this.redis.del(`earnings:total:${userId}`);
    } catch (error) {
      this.logger.warn(
        `Could not invalidate cached earnings summary for user ${userId}: ` +
          `${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

/** Round to cents, so repeated float additions do not drift into 0.30000000000000004. */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
