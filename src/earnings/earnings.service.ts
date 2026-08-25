import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { ConfigService } from '../config/config.service';

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
  ) {}

  async getUserTotalEarnings(userId: number): Promise<UserEarningsSummary> {
    const cacheKey = earnings:total:;
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    const result = await this.prisma.withTransaction(async (tx) => {
      const totalEarnings = await tx.earning.aggregate({
        where: { clip: { video: { userId } }, deletedAt: null },
        _sum: { amount: true },
      });

      const totalPaidOut = await tx.payout.aggregate({
        where: { userId, status: { in: ['completed', 'processing'] } },
        _sum: { amount: true },
      });

      const totalEarned = totalEarnings._sum.amount ?? 0;
      const paid = totalPaidOut._sum.amount ?? 0;

      return {
        totalEarned,
        totalPaidOut: paid,
        availableBalance: totalEarned - paid,
        currency: 'USD' as const,
      };
    });

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
  ): Promise<EarningRecord[]> {
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
    }

    return earning;
  }
}