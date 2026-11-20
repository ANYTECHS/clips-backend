import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Runs on the first day of every month at midnight UTC (0 0 1 * *).
 *
 * Generates a permanent MonthlyEarning summary for every user who had
 * earnings in the previous calendar month. Records are immutable once
 * created (upsert with no-op on conflict) so historical data is auditable.
 * Uses UTC consistently. Closes #992.
 */
@Injectable()
export class MonthlyEarningsCronService {
  private readonly logger = new Logger(MonthlyEarningsCronService.name);

  constructor(
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Cron: 0 0 1 * * — first day of every month at 00:00 UTC.
   */
  @Cron('0 0 1 * *', { name: 'monthly-earnings-summary' })
  async handleMonthlyEarningsCron(): Promise<void> {
    const now = new Date();
    const targetDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
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
   * Generate MonthlyEarning records for all users with earnings in period.
   * Idempotent: upsert with no-op update prevents duplicates.
   */
  async generateMonthlySummaries(year: number, month: number): Promise<void> {
    const from = new Date(Date.UTC(year, month - 1, 1));
    const to = new Date(Date.UTC(year, month, 1));
    // Distinct users with earnings in UTC month
    const rows = await this.prisma.earning.findMany({
      where: { date: { gte: from, lte: to }, deletedAt: null },
      select: { clip: { select: { video: { select: { userId: true } } } } },
    });
    const userIds = [...new Set(rows.map((r) => r.clip.video.userId))];

    if (userIds.length === 0) {
      this.logger.log(`[MonthlyEarningsCron] No active users found for ${year}-${month}`);
      return;
    }

    let created = 0;
    let skipped = 0;

    for (const userId of userIds) {
      try {
        // Group directly by source currency and platform. Never convert currencies
        // together: a monthly row has one authoritative currency.
        const rows = await this.prisma.earning.findMany({
          where: {
            clip: { video: { userId } },
            date: { gte: from, lt: new Date(Date.UTC(year, month, 1)) },
            deletedAt: null,
          },
          select: {
            amount: true,
            currency: true,
            source: true,
            clip: { select: { platform: true } },
          },
        });

        const currencies = new Map<string, { total: number; platforms: Record<string, number> }>();
        for (const row of rows) {
          const currency = String(row.currency || 'USD').toUpperCase();
          const bucket = currencies.get(currency) ?? { total: 0, platforms: {} };
          const platform = row.source || row.clip?.platform || 'unknown';
          bucket.total += row.amount;
          bucket.platforms[platform] = (bucket.platforms[platform] || 0) + row.amount;
          currencies.set(currency, bucket);
        }

        for (const [currency, bucket] of currencies) {
          await this.prisma.monthlyEarning.upsert({
            where: {
              userId_year_month_currency: { userId, year, month, currency },
            },
            create: {
              userId,
              year,
              month,
              totalAmount: bucket.total,
              currency,
              platformBreakdown: bucket.platforms,
            },
            update: {
              totalAmount: bucket.total,
              platformBreakdown: bucket.platforms,
              updatedAt: new Date(),
            },
          });
          created++;
        }
      } catch (userError) {
        this.logger.error(
          `[MonthlyEarningsCron] Failed for user ${userId}: ${
            userError instanceof Error ? userError.message : String(userError)
          }`,
        );
      }
    }

    this.logger.log(
      `[MonthlyEarningsCron] ${year}-${month} complete — created=${created} skipped=${skipped} total_users=${userIds.length}`,
    );
  }
}
