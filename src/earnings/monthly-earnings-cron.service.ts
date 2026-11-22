import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

const MONTHLY_EARNINGS_PAGE_SIZE = 500;

interface MonthlyEarningBucket {
  userId: number;
  currency: string;
  totalAmount: number;
  platformBreakdown: Record<string, number>;
}

interface MonthlyEarningSourceRow {
  id: number;
  amount: number;
  currency: string | null;
  clip: {
    platform: string | null;
    video: { userId: number } | null;
  } | null;
}

interface MonthlyEarningReader {
  findMany(args: {
    where: { date: { gte: Date; lt: Date }; deletedAt: null };
    select: {
      id: true;
      amount: true;
      currency: true;
      clip: {
        select: {
          platform: true;
          video: { select: { userId: true } };
        };
      };
    };
    orderBy: { id: 'asc' };
    take: number;
    cursor?: { id: number };
    skip?: number;
  }): Promise<MonthlyEarningSourceRow[]>;
}

interface MonthlyEarningWriter {
  upsert(args: {
    where: {
      userId_year_month_currency: {
        userId: number;
        year: number;
        month: number;
        currency: string;
      };
    };
    create: {
      userId: number;
      year: number;
      month: number;
      totalAmount: number;
      currency: string;
      platformBreakdown: Record<string, number>;
    };
    update: {
      totalAmount: number;
      platformBreakdown: Record<string, number>;
    };
  }): Promise<unknown>;
}

/**
 * Runs on the first day of every month at midnight UTC (0 0 1 * *).
 *
 * Generates one MonthlyEarning summary per user and currency for the previous
 * calendar month. The unique key and upsert make reruns safe.
 */
@Injectable()
export class MonthlyEarningsCronService {
  private readonly logger = new Logger(MonthlyEarningsCronService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Cron: 0 0 1 * * — first day of every month at 00:00 UTC.
   */
  @Cron('0 0 1 * *', { name: 'monthly-earnings-summary', timeZone: 'UTC' })
  async handleMonthlyEarningsCron(): Promise<void> {
    const now = new Date();
    const targetDate = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1),
    );
    const year = targetDate.getUTCFullYear();
    const month = targetDate.getUTCMonth() + 1;

    this.logger.log(
      `[MonthlyEarningsCron] Starting summary generation for ${year}-${String(month).padStart(2, '0')}`,
    );

    try {
      await this.generateMonthlySummaries(year, month);
      this.logger.log(
        `[MonthlyEarningsCron] Completed for ${year}-${String(month).padStart(2, '0')}`,
      );
    } catch (error) {
      this.logger.error(
        `[MonthlyEarningsCron] Failed for ${year}-${String(month).padStart(2, '0')}: ${
          error instanceof Error ? error.message : String(error)
        }`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  /**
   * Generate MonthlyEarning records for all users with earnings in the UTC
   * month. Each native currency is aggregated independently.
   */
  async generateMonthlySummaries(year: number, month: number): Promise<void> {
    const from = new Date(Date.UTC(year, month - 1, 1));
    const to = new Date(Date.UTC(year, month, 1));
    const buckets = new Map<string, MonthlyEarningBucket>();
    const earningReader = this.prisma.earning as MonthlyEarningReader;
    const monthlyEarningWriter = this.prisma
      .monthlyEarning as MonthlyEarningWriter;
    let cursor: number | undefined;

    for (;;) {
      const rows = await earningReader.findMany({
        where: { date: { gte: from, lt: to }, deletedAt: null },
        select: {
          id: true,
          amount: true,
          currency: true,
          clip: {
            select: {
              platform: true,
              video: { select: { userId: true } },
            },
          },
        },
        orderBy: { id: 'asc' },
        take: MONTHLY_EARNINGS_PAGE_SIZE,
        ...(cursor === undefined ? {} : { cursor: { id: cursor }, skip: 1 }),
      });

      for (const earning of rows) {
        const userId = earning.clip?.video?.userId;
        if (userId === undefined || userId === null) {
          this.logger.warn(
            `[MonthlyEarningsCron] Earning ${earning.id} has no owning user; excluded from aggregation`,
          );
          continue;
        }

        const currency = (earning.currency || 'USD').toUpperCase();
        const key = `${userId}:${currency}`;
        const bucket = buckets.get(key) ?? {
          userId,
          currency,
          totalAmount: 0,
          platformBreakdown: {},
        };
        const platform = earning.clip?.platform || 'unknown';
        bucket.totalAmount += earning.amount;
        bucket.platformBreakdown[platform] =
          (bucket.platformBreakdown[platform] || 0) + earning.amount;
        buckets.set(key, bucket);
      }

      if (rows.length < MONTHLY_EARNINGS_PAGE_SIZE) {
        break;
      }
      cursor = rows[rows.length - 1].id;
    }

    if (buckets.size === 0) {
      this.logger.log(
        `[MonthlyEarningsCron] No active earnings found for ${year}-${month}`,
      );
      return;
    }

    let written = 0;
    let failed = 0;
    for (const bucket of buckets.values()) {
      try {
        await monthlyEarningWriter.upsert({
          where: {
            userId_year_month_currency: {
              userId: bucket.userId,
              year,
              month,
              currency: bucket.currency,
            },
          },
          create: {
            userId: bucket.userId,
            year,
            month,
            totalAmount: round2(bucket.totalAmount),
            currency: bucket.currency,
            platformBreakdown: roundBreakdown(bucket.platformBreakdown),
          },
          update: {
            totalAmount: round2(bucket.totalAmount),
            platformBreakdown: roundBreakdown(bucket.platformBreakdown),
          },
        });

        written++;
      } catch (error) {
        failed++;
        this.logger.error(
          `[MonthlyEarningsCron] Failed for user ${bucket.userId} (${bucket.currency}): ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    this.logger.log(
      `[MonthlyEarningsCron] ${year}-${month} complete — written=${written} failed=${failed}`,
    );
  }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundBreakdown(
  breakdown: Record<string, number>,
): Record<string, number> {
  return Object.fromEntries(
    Object.entries(breakdown).map(([platform, amount]) => [
      platform,
      round2(amount),
    ]),
  );
}
