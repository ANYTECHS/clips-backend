import { Injectable, Logger } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import type { ThrottlerStorageRecord } from '@nestjs/throttler/dist/throttler-storage-record.interface';
import { RedisService } from '../../redis/redis.service';

/**
 * Redis-backed throttler storage for @nestjs/throttler v6.
 *
 * Key format:  throttler:<throttlerName>:<key>
 * Block key:   throttler:<throttlerName>:<key>:blocked
 *
 * Uses a simple counter window: INCR + EXPIRE so the TTL is a sliding
 * window from the first hit in that window.
 *
 * Resilience: all Redis operations are wrapped in try/catch. When Redis
 * is unavailable the service fails open (returns totalHits=0) so a Redis
 * outage doesn't take down the entire API with 500 errors.
 */
@Injectable()
export class ThrottlerStorageRedisService implements ThrottlerStorage {
  private readonly logger = new Logger(ThrottlerStorageRedisService.name);

  constructor(private readonly redisService: RedisService) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    // Fail open immediately when Redis is known to be down
    if (!this.redisService.isAvailable()) {
      return this.failOpenRecord(ttl);
    }

    const redis = this.redisService.getClient();
    const counterKey = `throttler:${throttlerName}:${key}`;
    const blockKey = `${counterKey}:blocked`;
    const blockSeconds = Math.ceil(blockDuration / 1000);

    try {
      // Check if the client is already in a block window
      const blocked = await redis.get(blockKey);
      if (blocked) {
        const blockTtl = await redis.pttl(blockKey);
        return {
          totalHits: limit + 1,
          timeToExpire: 0,
          isBlocked: true,
          timeToBlockExpire: Math.max(0, blockTtl),
        };
      }

      // Atomically increment and read the remaining TTL
      const pipeline = redis.pipeline();
      pipeline.incr(counterKey);
      pipeline.pttl(counterKey);
      const results = await pipeline.exec();

      if (!results) {
        this.logger.warn('Redis pipeline returned null — failing open for throttler');
        return this.failOpenRecord(ttl);
      }

      const [[incrErr, totalHits], [pttlErr, remainingMs]] =
        results as [[Error | null, number], [Error | null, number]];

      if (incrErr || pttlErr) {
        this.logger.warn(
          `Redis pipeline error — failing open for throttler: ${incrErr?.message ?? pttlErr?.message}`,
        );
        return this.failOpenRecord(ttl);
      }

      // Set expiry only on the first increment (pttl returns -1 when no TTL set)
      if (remainingMs === -1) {
        await redis.pexpire(counterKey, ttl);
      }

      const timeToExpire = remainingMs === -1 ? ttl : remainingMs;
      const isBlocked = totalHits > limit;

      if (isBlocked && blockSeconds > 0) {
        await redis.set(blockKey, '1', 'EX', blockSeconds);
      }

      return {
        totalHits,
        timeToExpire,
        isBlocked,
        timeToBlockExpire: isBlocked ? blockSeconds * 1000 : 0,
      };
    } catch (err) {
      this.logger.warn(
        `ThrottlerStorageRedis error — failing open: ${(err as Error).message}`,
      );
      return this.failOpenRecord(ttl);
    }
  }

  /** Safe default returned when Redis is unavailable — allows the request through. */
  private failOpenRecord(ttl: number): ThrottlerStorageRecord {
    return { totalHits: 0, timeToExpire: ttl, isBlocked: false, timeToBlockExpire: 0 };
  }
}
