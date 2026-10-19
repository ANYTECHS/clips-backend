import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { ConfigService } from '../config/config.service';

export interface CachedEarningsSummary {
  totalEarned: number;
  totalPaidOut: number;
  availableBalance: number;
  currency: string;
}

/**
 * Redis cache layer for frequently requested earnings totals.
 *
 * Cache keys:
 *  - earnings:total:{userId}       — full UserEarningsSummary
 *  - earnings:user:{userId}:total  — lightweight { total, currency }
 *
 * TTL is configured via EARNINGS_CACHE_TTL (seconds, default 3600).
 * Redis failures are logged and swallowed so callers fall back to PostgreSQL.
 */
@Injectable()
export class EarningsCacheService {
  private readonly logger = new Logger(EarningsCacheService.name);

  constructor(
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {}

  summaryKey(userId: number): string {
    return `earnings:total:${userId}`;
  }

  totalKey(userId: number): string {
    return `earnings:user:${userId}:total`;
  }

  private get ttlSeconds(): number {
    return this.config.earningsCacheTtlSeconds ?? 3600;
  }

  async getSummary(userId: number): Promise<CachedEarningsSummary | null> {
    try {
      const cached = await this.redis.get(this.summaryKey(userId));
      if (cached) {
        return JSON.parse(cached) as CachedEarningsSummary;
      }
    } catch (err) {
      this.logger.error(
        `Redis error reading summary cache: ${(err as Error).message}`,
      );
    }
    return null;
  }

  async setSummary(userId: number, summary: CachedEarningsSummary): Promise<void> {
    try {
      await this.redis.setex(
        this.summaryKey(userId),
        this.ttlSeconds,
        JSON.stringify(summary),
      );
    } catch (err) {
      this.logger.error(
        `Redis error writing summary cache: ${(err as Error).message}`,
      );
    }
  }

  async getTotal(
    userId: number,
  ): Promise<{ total: number; currency: string } | null> {
    try {
      const cached = await this.redis.get(this.totalKey(userId));
      if (cached) {
        return JSON.parse(cached) as { total: number; currency: string };
      }
    } catch (err) {
      this.logger.error(
        `Redis error reading total cache: ${(err as Error).message}`,
      );
    }
    return null;
  }

  async setTotal(
    userId: number,
    value: { total: number; currency: string },
  ): Promise<void> {
    try {
      await this.redis.setex(
        this.totalKey(userId),
        this.ttlSeconds,
        JSON.stringify(value),
      );
    } catch (err) {
      this.logger.error(
        `Redis error writing total cache: ${(err as Error).message}`,
      );
    }
  }

  /**
   * Invalidate all earnings cache entries for a user.
   * Called when earnings change (create, webhook, payout completion).
   */
  async invalidate(userId: number): Promise<void> {
    if (!userId) return;
    try {
      await this.redis.del(this.summaryKey(userId), this.totalKey(userId));
    } catch (err) {
      this.logger.error(
        `Failed to invalidate earnings cache for user ${userId}: ${(err as Error).message}`,
      );
    }
  }
}
