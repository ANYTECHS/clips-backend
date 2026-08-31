import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { ConfigService } from '../config/config.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CurrencyService } from '../common/services/currency.service';

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
    private readonly redis: RedisService,
    private readonly config: ConfigService,
    private readonly eventEmitter: EventEmitter2,
    private readonly currencyService: CurrencyService,
  ) {}

  async getUserTotalEarnings(userId: number, tx?: any): Promise<UserEarningsSummary> {
    const cacheKey = `earnings:total:${userId}`;
    if (!tx) {
      try {
        const cached = await this.redis.get(cacheKey);
        if (cached) {
          return JSON.parse(cached);
        }
      } catch (err) {
        this.logger.error(`Redis error reading balance cache: ${err.message}`);
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
      try {
        await this.redis.setex(
          cacheKey,
          this.config.earningsCacheTtlSeconds ?? 3600,
          JSON.stringify(result),
        );
      } catch (err) {
        this.logger.error(`Redis error writing balance cache: ${err.message}`);
      }
    }

    return result;
  }

  async getUserTotalEarningsCached(userId: number): Promise<{ total: number; currency: string }> {
    const cacheKey = `earnings:user:${userId}:total`;
    try {
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (err) {
      this.logger.error(`Redis error reading user earnings total cache: ${err.message}`);
    }

    const total = await this.getUserTotalEarningsFromDb(userId);
    const result = {
      total,
      currency: 'USD',
    };

    try {
      await this.redis.setex(
        cacheKey,
        this.config.earningsCacheTtlSeconds ?? 3600,
        JSON.stringify(result),
      );
    } catch (err) {
      this.logger.error(`Redis error writing user earnings total cache: ${err.message}`);
    }

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
    const keys = [
      `earnings:total:${userId}`,
      `earnings:user:${userId}:total`,
    ];
    try {
      await this.redis.del(...keys);
    } catch (err) {
      this.logger.error(`Failed to invalidate cache for user ${userId}: ${err.message}`);
    }
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
