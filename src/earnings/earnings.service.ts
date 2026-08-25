import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
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
