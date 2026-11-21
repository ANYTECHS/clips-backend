import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MonthlySummaryService {
  private readonly logger = new Logger(MonthlySummaryService.name);

  constructor(private prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_1ST_DAY_OF_MONTH_AT_MIDNIGHT)
  async generateMonthlySummaries(): Promise<void> {
    this.logger.log('Starting monthly earnings summary generation');

    const now = new Date();
    const lastMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const year = lastMonth.getUTCFullYear();
    const month = lastMonth.getUTCMonth() + 1;

    try {
      const users = await this.prisma.user.findMany({
        select: { id: true },
      });

      for (const user of users) {
        await this.generateUserMonthlySummary(user.id, year, month);
      }

      this.logger.log(
        `Monthly earnings summary completed for ${users.length} users`,
      );
    } catch (error) {
      this.logger.error('Failed to generate monthly summaries', error);
    }
  }

  async generateUserMonthlySummary(
    userId: number,
    year: number,
    month: number,
  ): Promise<void> {
    const startDate = new Date(Date.UTC(year, month - 1, 1));
    const endDate = new Date(Date.UTC(year, month, 1));

    const earnings = await this.prisma.earning.findMany({
      where: {
        clip: {
          video: {
            userId,
          },
        },
        date: {
          gte: startDate,
          lt: endDate,
        },
        deletedAt: null,
      },
      include: {
        clip: { select: { platform: true } },
      },
    });

    if (earnings.length === 0) {
      return;
    }

    const buckets = new Map<string, { total: number; platforms: Record<string, number> }>();
    for (const earning of earnings) {
      const currency = String(earning.currency || 'USD').toUpperCase();
      const bucket = buckets.get(currency) ?? { total: 0, platforms: {} };
      const platform = earning.source || earning.clip.platform || 'unknown';
      bucket.total += earning.amount;
      bucket.platforms[platform] = (bucket.platforms[platform] || 0) + earning.amount;
      buckets.set(currency, bucket);
    }

    for (const [currency, bucket] of buckets) {
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
    }

    this.logger.log(
      `Generated monthly summary for user ${userId}: ${year}-${month}`,
    );
  }
}
