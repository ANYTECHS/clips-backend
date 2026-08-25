import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { ConfigService } from '../config/config.service';

export interface EarningsTotalResult {
  total: number;
  currency: string;
  breakdown: {
    royalties: number;
    subscriptions: number;
    other: number;
  };
}

@Injectable()
export class EarningsService {
  private readonly logger = new Logger(EarningsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {}

  private cacheKey(userId: number): string {
    return `earnings:total:user:${userId}`;
  }

  /**
   * Returns the total earnings for a user, broken down by source.
   * Results are cached in Redis for `earningsCacheTtlSeconds`.
   */
  async getUserTotalEarnings(userId: number): Promise<EarningsTotalResult> {
    const key = this.cacheKey(userId);

    const cached = await this.redis.get(key);
    if (cached) {
      try {
        return JSON.parse(cached) as EarningsTotalResult;
      } catch {
        this.logger.warn(`Failed to parse cached earnings for user ${userId}`);
      }
    }

    const rows = await this.prisma.earning.findMany({
      where: { clip: { video: { userId } }, deletedAt: null },
      select: { amount: true, source: true, currency: true },
    });

    let royalties = 0;
    let subscriptions = 0;
    let other = 0;

    for (const row of rows) {
      const source = (row.source ?? '').toLowerCase();
      if (source.includes('royalt')) {
        royalties += row.amount;
      } else if (source.includes('subscri')) {
        subscriptions += row.amount;
      } else {
        other += row.amount;
      }
    }

    const total = royalties + subscriptions + other;
    const result: EarningsTotalResult = {
      total,
      currency: rows[0]?.currency ?? 'USD',
      breakdown: { royalties, subscriptions, other },
    };

    await this.redis.setex(key, this.config.earningsCacheTtlSeconds, JSON.stringify(result));

    return result;
  }

  /**
   * Invalidates the cached earnings total for a user.
   * Call this whenever earnings are created, updated, or deleted.
   */
  async invalidateUserEarningsCache(userId: number): Promise<void> {
    try {
      await this.redis.del(this.cacheKey(userId));
    } catch (err) {
      this.logger.warn(
        `Failed to invalidate earnings cache for user ${userId}: ${(err as Error).message}`,
      );
    }
  }
}
