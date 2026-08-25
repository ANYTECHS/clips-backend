import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { ConfigService } from '../config/config.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CurrencyService } from '../common/services/currency.service';
import { RedisService } from '../redis/redis.service';
import { Prisma } from '@prisma/client';

const CACHE_KEY_PREFIX = 'earnings:user:';
const CACHE_TTL_SECONDS = 3600;

@Injectable()
export class EarningsService {
  private readonly logger = new Logger(EarningsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async getUserTotalEarnings(userId: number): Promise<{
    totalEarned: number;
    totalPaidOut: number;
    availableBalance: number;
    currency: string;
  }> {
    const cacheKey = earnings:total:;
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    const totalEarnings = await this.prisma.earning.aggregate({
      where: { clip: { video: { userId } }, deletedAt: null },
      _sum: { amount: true },
    });

    const totalPaidOut = await this.prisma.payout.aggregate({
      where: { userId, status: { in: ['completed', 'processing'] } },
      _sum: { amount: true },
    });

    const totalEarned = totalEarnings._sum.amount ?? 0;
    const paid = totalPaidOut._sum.amount ?? 0;

    const result = {
      totalEarned,
      totalPaidOut: paid,
      availableBalance: totalEarned - paid,
      currency: 'USD',
    };

    await this.redis.setex(
      cacheKey,
      this.config.earningsCacheTtlSeconds,
      JSON.stringify(result),
    );

    return result;
  }

  async getEarningsByPeriod(
    userId: number,
    startDate: Date,
    endDate: Date,
  ) {
    return this.prisma.earning.findMany({
      where: {
        clip: { video: { userId } },
        deletedAt: null,
        date: { gte: startDate, lte: endDate },
      },
      orderBy: { date: 'desc' },
      select: {
        id: true,
        amount: true,
        currency: true,
        date: true,
        source: true,
        clipId: true,
      },
    });
  }

  async refreshEarningsCache(userId: number): Promise<void> {
    const cacheKey = earnings:total:;
    await this.redis.del(cacheKey);
    await this.getUserTotalEarnings(userId);
  }

  async createEarning(data: {
    clipId: number;
    amount: number;
    currency?: string;
    date: Date;
    source?: string;
  }) {
    const earning = await this.prisma.earning.create({
      data: {
        clipId: data.clipId,
        amount: data.amount,
        currency: data.currency ?? 'USD',
        date: data.date,
        source: data.source ?? null,
      },
    });

    const clip = await this.prisma.clip.findUnique({
      where: { id: data.clipId },
      include: { video: { select: { userId: true } } },
    });

    if (clip?.video?.userId) {
      await this.refreshEarningsCache(clip.video.userId);
      this.eventEmitter.emit('earnings.updated', {
        userId: clip.video.userId,
        earningId: earning.id,
        amount: earning.amount,
      });
    }

    return earning;
  }
}
    private readonly currencyService: CurrencyService,
    private readonly redis: RedisService,
  ) {}

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
      amountInBaseCurrency = conversion.amount;
      exchangeRate = conversion.rate;
    } else {
      amountInBaseCurrency = data.amount;
      exchangeRate = 1;
    }

    return this.prisma.earning.create({
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
  }

  async getEarnings(
    userId: number,
    filters?: { startDate?: Date; endDate?: Date },
  ) {
    const cacheKey = `${CACHE_KEY_PREFIX}${userId}:${JSON.stringify(filters ?? {})}`;

    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    const where: Prisma.EarningWhereInput = {
      clip: { video: { userId } },
      deletedAt: null,
    };

    if (filters?.startDate || filters?.endDate) {
      where.date = {};
      if (filters.startDate) where.date.gte = filters.startDate;
      if (filters.endDate) where.date.lte = filters.endDate;
    }

    const earnings = await this.prisma.earning.findMany({
      where,
      include: {
        clip: {
          select: { id: true, title: true },
        },
      },
      orderBy: { date: 'desc' },
    });

    await this.redis.setex(
      cacheKey,
      CACHE_TTL_SECONDS,
      JSON.stringify(earnings),
    );
    return earnings;
  }

  async aggregateEarnings(userId: number) {
    const baseCurrency = this.currencyService.getBaseCurrency();

    const result = await this.prisma.earning.aggregate({
      where: { clip: { video: { userId } }, deletedAt: null },
      _sum: {
        amount: true,
        amountInBaseCurrency: true,
      },
      _count: true,
    });

    return {
      totalAmount: result._sum.amount ?? 0,
      totalAmountInBaseCurrency: result._sum.amountInBaseCurrency ?? 0,
      baseCurrency,
      count: result._count,
    };
  }

  async invalidateUserEarningsCache(userId: number): Promise<void> {
    const pattern = `${CACHE_KEY_PREFIX}${userId}:*`;
    const client = this.redis.getClient();
    const keys = await client.keys(pattern);
    if (keys.length > 0) {
      await client.del(...keys);
    }
  }
}
