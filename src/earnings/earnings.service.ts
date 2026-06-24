import { Injectable } from '@nestjs/common';
import { Currency } from './earnings.types';
import { CurrencyConversionService } from './currency-conversion.service';
import { EarningsExportService, EarningsExportOptions, EarningsExportResult } from './earnings-export.service';
import { EarningsAggregationService } from './earnings-aggregation.service';
import { PrismaService } from '../prisma/prisma.service';
export interface LeaderboardEntry {
  rank: number;
  label: string;
  totalEarned: number;
}

@Injectable()
export class EarningsService {
  constructor(
    private aggregationService: EarningsAggregationService,
    private exportService: EarningsExportService,
    private currencyConversion: CurrencyConversionService,
    private prisma: PrismaService,
  ) {}

  public async invalidateUserEarningsCache(userId: number): Promise<void> {
    return this.aggregationService.invalidateUserEarningsCache(userId);
  }

  async getUserTotalEarnings(userId: number, targetCurrency: Currency = Currency.USD) {
    return this.aggregationService.getUserTotalEarnings(userId, targetCurrency);
  }

  async getEarningsByPeriod(
    userId: number,
    startDate: Date,
    endDate: Date,
    targetCurrency: Currency = Currency.USD,
  ) {
    return this.aggregationService.getEarningsByPeriod(userId, startDate, endDate, targetCurrency);
  }

  async getEarningsDashboard(
    userId: number,
    page = 1,
    limit = 20,
    targetCurrency: Currency = Currency.USD,
  ) {
    return this.aggregationService.getEarningsDashboard(userId, page, limit, targetCurrency);
  }

  async exportEarningsCsv(
    userId: number,
    options: EarningsExportOptions,
  ): Promise<EarningsExportResult> {
    return this.exportService.exportEarningsCsv(userId, options);
  }

  async exportTaxReportCsv(userId: number, year: number) {
    return this.taxReportExportService.exportTaxReportCsv(userId, year);
  }

  async softDelete(earningId: number, userId: number) {
    return this.aggregationService.softDelete(earningId, userId);
  }

  async getLeaderboard(limit = 10): Promise<LeaderboardEntry[]> {
    return this.aggregationService.getLeaderboard(limit);
  }

  async getEarningsByPlatform(userId: number) {
    return this.aggregationService.getEarningsByPlatform(userId);
  }
  async getEarningsHistory(
    userId: number,
    options: {
      page?: number;
      limit?: number;
      startDate?: string;
      endDate?: string;
      sort?: 'asc' | 'desc';
    } = {},
  ) {
    const page = options.page ?? 1;
    const limit = options.limit ?? 20;
    const skip = (page - 1) * limit;
    const where: any = {
      clip: { video: { userId } },
      deletedAt: null,
    };
    if (options.startDate) {
      where.date = { ...(where.date || {}), gte: new Date(options.startDate) };
    }
    if (options.endDate) {
      where.date = { ...(where.date || {}), lte: new Date(options.endDate) };
    }
    const order = options.sort ?? 'desc';
    const [items, total] = await Promise.all([
      this.prisma.earning.findMany({
        where,
        orderBy: { date: order },
        skip,
        take: limit,
        select: {
          id: true,
          amount: true,
          currency: true,
          source: true,
          date: true,
          clip: { select: { title: true } },
        },
      }),
      this.prisma.earning.count({ where }),
    ]);
    return { items, total, page, limit };
  }
    // Total earnings from clips and subscriptions
    const totalEarnings = await this.aggregationService.getUserTotalEarnings(userId, targetCurrency);

    // Pending payouts (status pending or approved)
    const pendingPayouts = await this.prisma.payout.findMany({
      where: { userId, status: 'pending' },
      select: { amount: true, currency: true },
    });
    const pendingTotal = pendingPayouts.reduce((sum, p) =>
      sum + this.currencyConversion.convert(
        p.amount,
        (p.currency as Currency) || Currency.USD,
        targetCurrency,
      ),
    0);

    // Paid earnings (completed or processing)
    const paidPayouts = await this.prisma.payout.findMany({
      where: { userId, status: { in: ['completed', 'processing'] } },
      select: { amount: true, currency: true },
    });
    const paidTotal = paidPayouts.reduce((sum, p) =>
      sum + this.currencyConversion.convert(
        p.amount,
        (p.currency as Currency) || Currency.USD,
        targetCurrency,
      ),
    0);

    // Current balance after subtracting paid and pending payouts
    const currentBalance = totalEarnings.total - paidTotal - pendingTotal;

    return {
      totalEarnings: totalEarnings.total,
      pendingPayouts: pendingTotal,
      paidEarnings: paidTotal,
      currentBalance,
      currency: targetCurrency,
    };
  }

