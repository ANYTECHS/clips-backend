import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Currency } from './earnings.types';
import { CurrencyConversionService } from './currency-conversion.service';

export interface EarningsDashboardMetrics {
  monthlyEarnings: number;
  growthPercentage: number;
  pendingPayouts: number;
  currency: Currency;
  period: {
    currentMonth: string;
    previousMonth: string;
  };
}

@Injectable()
export class EarningsMetricsService {
  constructor(
    private prisma: PrismaService,
    private currencyConversion: CurrencyConversionService,
  ) {}

  async getDashboardMetrics(
    userId: number,
    targetCurrency: Currency = Currency.USD,
  ): Promise<EarningsDashboardMetrics> {
    const now = new Date();
    const currentMonthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );
    const nextMonthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
    );
    const previousMonthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1),
    );

    const [currentMonthEarnings, previousMonthEarnings, pendingPayouts] =
      await Promise.all([
        this.sumEarningsForRange(
          userId,
          currentMonthStart,
          nextMonthStart,
          targetCurrency,
        ),
        this.sumEarningsForRange(
          userId,
          previousMonthStart,
          currentMonthStart,
          targetCurrency,
        ),
        this.sumPendingPayouts(userId, targetCurrency),
      ]);

    const growthPercentage = this.calculateGrowthPercentage(
      currentMonthEarnings,
      previousMonthEarnings,
    );

    return {
      monthlyEarnings: currentMonthEarnings,
      growthPercentage,
      pendingPayouts,
      currency: targetCurrency,
      period: {
        currentMonth: currentMonthStart.toISOString().slice(0, 7),
        previousMonth: previousMonthStart.toISOString().slice(0, 7),
      },
    };
  }

  private async sumEarningsForRange(
    userId: number,
    start: Date,
    end: Date,
    targetCurrency: Currency,
  ): Promise<number> {
    const earnings = await this.prisma.earning.findMany({
      where: {
        clip: { video: { userId } },
        deletedAt: null,
        date: { gte: start, lt: end },
      },
      select: { amount: true, currency: true },
    });

    return earnings.reduce(
      (sum, earning) =>
        sum +
        this.currencyConversion.convert(
          earning.amount,
          (earning.currency as Currency) || Currency.USD,
          targetCurrency,
        ),
      0,
    );
  }

  private async sumPendingPayouts(
    userId: number,
    targetCurrency: Currency,
  ): Promise<number> {
    const payouts = await this.prisma.payout.findMany({
      where: {
        userId,
        status: { in: ['pending', 'pending_approval', 'approved', 'processing'] },
      },
      select: { amount: true, currency: true },
    });

    return payouts.reduce(
      (sum, payout) =>
        sum +
        this.currencyConversion.convert(
          payout.amount,
          (payout.currency as Currency) || Currency.USD,
          targetCurrency,
        ),
      0,
    );
  }

  private calculateGrowthPercentage(
    current: number,
    previous: number,
  ): number {
    if (previous === 0) {
      return current > 0 ? 100 : 0;
    }

    const growth = ((current - previous) / previous) * 100;
    return Math.round(growth * 100) / 100;
  }
}
