import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CurrencyService } from '../common/services/currency.service';
import { EarningsCacheService } from './earnings-cache.service';

export interface UserEarningsSummary {
  totalEarned: number;
  totalPaidOut: number;
  availableBalance: number;
  currency: string;
}

export interface EarningRecord {
  id: number;
  amount: number;
  currency: string;
  date: Date;
  source: string | null;
  clipId: number;
}

@Injectable()
export class EarningsService {
  private readonly logger = new Logger(EarningsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: EarningsCacheService,
    private readonly eventEmitter: EventEmitter2,
    private readonly currencyService: CurrencyService,
  ) {}

  /**
   * Full earnings summary for a user.
   * Served from Redis when available; falls back to PostgreSQL on miss or Redis failure.
   * Response shape is identical regardless of cache source.
   */
  async getUserTotalEarnings(userId: number, tx?: any): Promise<UserEarningsSummary> {
    if (!tx) {
      const cached = await this.cache.getSummary(userId);
      if (cached) {
        return cached;
      }
    }

    const client = tx ?? this.prisma;

    const totalEarnings = await client.earning.aggregate({
      where: { clip: { video: { userId } }, deletedAt: null },
      _sum: { amountInBaseCurrency: true },
    });

    const totalPaidOut = await client.payout.aggregate({
      where: { userId, status: { in: ['completed', 'processing'] } },
      _sum: { amount: true },
    });

    const totalEarned = totalEarnings._sum.amountInBaseCurrency ?? 0;
    const paid = totalPaidOut._sum.amount ?? 0;

    const result: UserEarningsSummary = {
      totalEarned,
      totalPaidOut: paid,
      availableBalance: totalEarned - paid,
      currency: 'USD',
    };

    if (!tx) {
      await this.cache.setSummary(userId, result);
    }

    return result;
  }

  /**
   * Lightweight cached total used by GET /earnings.
   * Identical response whether data comes from Redis or PostgreSQL.
   */
  async getUserTotalEarningsCached(userId: number): Promise<{ total: number; currency: string }> {
    const cached = await this.cache.getTotal(userId);
    if (cached) {
      return cached;
    }

    const total = await this.getUserTotalEarningsFromDb(userId);
    const result = {
      total,
      currency: 'USD',
    };

    await this.cache.setTotal(userId, result);
    return result;
  }

  async getUserTotalEarningsFromDb(userId: number): Promise<number> {
    const totalEarnings = await this.prisma.earning.aggregate({
      where: { clip: { video: { userId } }, deletedAt: null },
      _sum: { amountInBaseCurrency: true },
    });
    return totalEarnings._sum.amountInBaseCurrency ?? 0;
  }

  async invalidateUserEarningsCache(userId: number): Promise<void> {
    await this.cache.invalidate(userId);
  }

  async getAvailableBalance(userId: number): Promise<number> {
    const summary = await this.getUserTotalEarnings(userId);
    return summary.availableBalance;
  }

  async createEarning(data: {
    clipId: number;
    amount: number;
    currency?: string;
    date: Date;
    source?: string;
  }) {
    const currency = (data.currency ?? 'USD').toUpperCase();
    this.currencyService.validateCurrency(currency);

    let amountInBaseCurrency: number | null = null;
    let exchangeRate: number | null = null;

    const baseCurrency = this.currencyService.getBaseCurrency();
    if (currency !== baseCurrency) {
      const conversion = await this.currencyService.convertToBaseCurrency(
        data.amount,
        currency,
      );
      amountInBaseCurrency = conversion.amountInBaseCurrency;
      exchangeRate = conversion.rate;
    } else {
      amountInBaseCurrency = data.amount;
      exchangeRate = 1;
    }

    const earning = await this.prisma.earning.create({
      data: {
        clipId: data.clipId,
        amount: data.amount,
        currency,
        amountInBaseCurrency,
        exchangeRate,
        date: data.date,
        source: data.source,
      },
    });

    const clip = await this.prisma.clip.findUnique({
      where: { id: data.clipId },
      include: { video: { select: { userId: true } } },
    });

    if (clip?.video?.userId) {
      const userId = clip.video.userId;
      await this.invalidateUserEarningsCache(userId);

      this.eventEmitter.emit('earnings.updated', {
        userId,
        earningId: earning.id,
        amount: earning.amount,
      });
    }

    return earning;
  }
}
