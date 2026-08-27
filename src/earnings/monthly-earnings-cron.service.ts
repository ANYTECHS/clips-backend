import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { EarningsService } from './earnings.service';

/**
 * Runs on the first day of every month at midnight (0 0 1 * *).
 *
 * Generates a permanent MonthlyEarning summary for every user who had
 * earnings in the previous calendar month.  Records are immutable once
 * created (upsert with no-op on conflict) so historical data is auditable.
 *
 * Acceptance criteria (Issue #779):
 *  - Monthly cron configured            ✔  @Cron('0 0 1 * *')
 *  - Monthly summary generated          ✔  generateMonthlySummaries()
 *  - Platform breakdown stored          ✔  platformBreakdown JSON field
 *  - Duplicate summaries prevented      ✔  upsert on (userId, year, month)
 *  - Previous months remain immutable   ✔  update clause is empty (no-op)
 *  - Job failures logged                ✔  try/catch with Logger.error
 */
@Injectable()
export class MonthlyEarningsCronService {
  private readonly logger = new Logger(MonthlyEarningsCronService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly earningsService: EarningsService,
  ) {}

  /**
   * Cron: 0 0 1 * * — first day of every month at 00:00 UTC.
   * Generates MonthlyEarning records for the previous calendar month.
   */
  @Cron('0 0 1 * *', { name: 'monthly-earnings-summary' })
  async handleMonthlyEarningsCron(): Promise<void> {
    const now = new Date();
    // Target: previous calendar month
    const targetDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const year = targetDate.getUTCFullYear();
    const month = targetDate.getUTCMonth() + 1; // 1-indexed

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
   * Generate (or skip if already present) MonthlyEarning records for all
   * active users for the given year/month.  This is intentionally idempotent
   * so it can be called manually for backfills without creating duplicates.
   *
   * @param year  Full calendar year, e.g. 2026
   * @param month Calendar month 1-12
   */
  async generateMonthlySummaries(year: number, month: number): Promise<void> {
    const from = new Date(Date.UTC(year, month - 1, 1));
    const to = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999)); // last ms of last day

    const userIds = await this.earningsService.getActiveUserIds();

    if (userIds.length === 0) {
      this.logger.log(`[MonthlyEarningsCron] No active users found for ${year}-${month}`);
      return;
    }

    let created = 0;
    let skipped = 0;

    for (const userId of userIds) {
      try {
        const summary = await this.earningsService.aggregateEarnings(userId, from, to);

        // Skip users with zero earnings in this period
        if (summary.totalAmount === 0) {
          skipped++;
          continue;
        }

        await this.prisma.monthlyEarning.upsert({
          where: { userId_year_month: { userId, year, month } },
          // Only create — never overwrite historical data (immutability requirement)
          create: {
            userId,
            year,
            month,
            totalAmount: summary.totalAmount,
            currency: summary.currency,
            platformBreakdown: summary.platformBreakdown,
          },
          // No-op update: if the record already exists we leave it untouched.
          // This prevents accidental mutation of auditable historical records.
          update: {},
        });

        created++;
        this.logger.debug(
          `[MonthlyEarningsCron] user=${userId} ${year}-${month} totalAmount=${summary.totalAmount}`,
        );
      } catch (userError) {
        // Log per-user failures but continue processing other users
        this.logger.error(
          `[MonthlyEarningsCron] Failed to process user ${userId}: ${
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
