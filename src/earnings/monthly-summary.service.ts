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
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const year = lastMonth.getFullYear();
    const month = lastMonth.getMonth() + 1;

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
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 1);

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
        clip: {
          select: {
            platform: true,
          },
        },
      },
    });

    if (earnings.length === 0) {
      return;
    }

    const totalAmount = earnings.reduce((sum, e) => sum + e.amount, 0);
    const platformBreakdown: Record<string, number> = {};

    for (const earning of earnings) {
      const platform = earning.clip.platform || 'unknown';
      platformBreakdown[platform] =
        (platformBreakdown[platform] || 0) + earning.amount;
    }

    await this.prisma.monthlyEarning.upsert({
      where: {
        userId_year_month: {
          userId,
          year,
          month,
        },
      },
      create: {
        userId,
        year,
        month,
        totalAmount,
        currency: 'USD',
        platformBreakdown,
      },
      update: {
        totalAmount,
        platformBreakdown,
        updatedAt: new Date(),
      },
    });

    this.logger.log(
      `Generated monthly summary for user ${userId}: ${year}-${month}`,
    );
  }
}
