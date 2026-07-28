import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../redis/redis.service';

export const QUEUE_RATE_LIMIT_KEY = 'queue_rate_limit';

export interface QueueRateLimitOptions {
  /**
   * Maximum active jobs a single user may enqueue within the sliding window.
   *
   * This is the *default* cap used when the corresponding environment variable
   * is not set.  The actual cap at runtime is resolved in the following order:
   *   1. `BULLMQ_{QUEUE_UPPER}_MAX_JOBS_PER_USER` env var (most specific)
   *   2. The value passed to @QueueRateLimit() (fallback / default)
   *
   * where {QUEUE_UPPER} is the queue name uppercased with hyphens replaced
   * by underscores (e.g. `clip-generation` → `CLIP_GENERATION`).
   */
  maxJobs: number;

  /**
   * Sliding window duration in seconds.
   *
   * Resolved in the same way as maxJobs:
   *   1. `BULLMQ_{QUEUE_UPPER}_RATE_WINDOW_SECS` env var
   *   2. The value passed to @QueueRateLimit() (default: 3600)
   */
  windowSecs?: number;

  /** Redis key prefix / queue identifier. */
  queue: string;
}

/**
 * Decorator that attaches rate-limit metadata to a controller method.
 *
 * Example:
 *   @UseGuards(QueueRateLimitGuard)
 *   @QueueRateLimit({ queue: 'clip-generation', maxJobs: 5 })
 *   generate(@Body() dto: ...) { ... }
 */
export const QueueRateLimit = (options: QueueRateLimitOptions) =>
  Reflect.metadata(QUEUE_RATE_LIMIT_KEY, options);

/**
 * QueueRateLimitGuard
 *
 * Limits how many queue jobs a single authenticated user may have active
 * within a configurable sliding window. Uses atomic Redis INCR + EXPIRE
 * so the limit is enforced correctly even across multiple app instances.
 *
 * Behaviour:
 *  - Increments a per-user counter key on every accepted request.
 *  - Sets the key TTL to `windowSecs` on first use (sliding window).
 *  - If the counter exceeds `maxJobs`, decrements (rolls back the increment)
 *    and throws HTTP 429.
 *  - Unauthenticated requests are passed through (auth guard handles them).
 *
 * Configuration (all configurable via environment variables):
 *
 *   BULLMQ_{QUEUE}_MAX_JOBS_PER_USER  — overrides the maxJobs default
 *   BULLMQ_{QUEUE}_RATE_WINDOW_SECS   — overrides the windowSecs default
 *
 * where {QUEUE} is the queue name uppercased with hyphens → underscores.
 * Example: clip-generation → CLIP_GENERATION
 *
 *   BULLMQ_CLIP_GENERATION_MAX_JOBS_PER_USER=10
 *   BULLMQ_CLIP_GENERATION_RATE_WINDOW_SECS=1800
 */
@Injectable()
export class QueueRateLimitGuard implements CanActivate {
  constructor(
    private readonly redisService: RedisService,
    private readonly reflector: Reflector,
    private readonly configService: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const options = this.reflector.get<QueueRateLimitOptions>(
      QUEUE_RATE_LIMIT_KEY,
      context.getHandler(),
    );

    if (!options) return true;

    const request = context.switchToHttp().getRequest();
    const userId: number | undefined = request.user?.userId;

    if (!userId) return true; // unauthenticated — let auth guard handle it

    // ── Resolve configurable limits from env, falling back to decorator values ─
    const envPrefix = `BULLMQ_${options.queue.toUpperCase().replace(/-/g, '_')}`;
    const maxJobs = parseInt(
      this.configService.get<string>(
        `${envPrefix}_MAX_JOBS_PER_USER`,
        String(options.maxJobs),
      ),
      10,
    );
    const windowSecs = parseInt(
      this.configService.get<string>(
        `${envPrefix}_RATE_WINDOW_SECS`,
        String(options.windowSecs ?? 3600),
      ),
      10,
    );

    // ── Fail open if Redis is unavailable ────────────────────────────────────
    // When Redis is down we cannot enforce the rate limit, so we allow the
    // request through. The queue's own overflow protection (QueueOverflowService)
    // still acts as a secondary guard against runaway enqueueing.
    if (!this.redisService.isAvailable()) {
      return true;
    }

    const key = `queue:ratelimit:${options.queue}:user:${userId}`;

    try {
      const current = await this.redisService.incr(key);
      if (current === 1) {
        await this.redisService.expire(key, windowSecs);
      }

      if (current > maxJobs) {
        // Roll back the increment — we will not enqueue this job
        await this.redisService.decr(key);

        // Read the remaining TTL so the caller knows when they can retry
        const ttl = await this.redisService.ttl(key);

        throw new HttpException(
          {
            statusCode: HttpStatus.TOO_MANY_REQUESTS,
            message:
              `Too many active jobs for queue "${options.queue}". ` +
              `Maximum ${maxJobs} jobs per user per ${windowSecs}s window.`,
            queue: options.queue,
            limit: maxJobs,
            windowSecs,
            retryAfter: ttl > 0 ? ttl : windowSecs,
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      return true;
    } catch (err) {
      // Re-throw HttpExceptions (429) — only swallow unexpected Redis errors
      if (err instanceof HttpException) throw err;

      // Redis error — fail open so a Redis outage doesn't block all job submissions
      return true;
    }
  }
}
