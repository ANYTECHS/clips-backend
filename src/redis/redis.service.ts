import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

/** How long (ms) to wait for a single Redis command before timing out. */
const COMMAND_TIMEOUT_MS = 3000;

/** How long (ms) to suppress repeated "Redis is down" log spam. */
const DOWN_LOG_THROTTLE_MS = 30_000;

/**
 * RedisService
 *
 * Wraps ioredis with:
 *  - Configurable reconnect strategy (exponential back-off, capped at 30 s)
 *  - Per-command timeout so a stalled Redis never blocks the event loop
 *  - In-memory availability flag so callers can check `isAvailable()` cheaply
 *  - All convenience methods (get/setex/del/incr/decr/expire/ttl) catch errors
 *    and return safe defaults — callers never have to worry about Redis being down
 *  - `getClient()` still exposes the raw ioredis instance for callers that need
 *    pipeline / pub-sub / advanced commands; those callers are responsible for
 *    their own error handling or can wrap calls in `safeExecute()`.
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly redis: Redis;

  /** true while the connection is healthy */
  private available = false;

  /** Timestamp of the last "Redis unavailable" log to throttle spam */
  private lastDownLogAt = 0;

  constructor() {
    this.redis = new Redis({
      host: process.env.REDIS_HOST ?? 'localhost',
      port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
      password: process.env.REDIS_PASSWORD || undefined,
      // Don't open the connection until the first command
      lazyConnect: true,
      // Per-command socket timeout — prevents commands from hanging indefinitely
      commandTimeout: COMMAND_TIMEOUT_MS,
      // Reconnect with exponential back-off, capped at 30 s
      retryStrategy: (times: number) => {
        const delay = Math.min(200 * Math.pow(2, times - 1), 30_000);
        this.logger.warn(
          `Redis reconnect attempt #${times} — next try in ${delay}ms`,
        );
        return delay;
      },
      // Stop retrying after this many consecutive failures (ioredis will emit
      // an error and mark the client as not-ready, but won't keep spinning)
      maxRetriesPerRequest: 1,
      // Fail fast on startup rather than blocking the process for minutes
      enableReadyCheck: true,
    });

    this.redis.on('connect', () => {
      this.available = true;
      this.logger.log('Redis connected');
    });

    this.redis.on('ready', () => {
      this.available = true;
      this.logger.log('Redis ready');
    });

    this.redis.on('close', () => {
      this.available = false;
      this.logDown('Redis connection closed');
    });

    this.redis.on('error', (err: Error) => {
      this.available = false;
      this.logDown(`Redis error: ${err.message}`);
    });

    this.redis.on('reconnecting', () => {
      this.available = false;
    });
  }

  onModuleDestroy(): void {
    void this.redis.quit().catch(() => this.redis.disconnect());
  }

  // ── Availability ────────────────────────────────────────────────────────────

  /**
   * Returns true if the Redis connection is currently healthy.
   * Cheap synchronous check — no network round-trip.
   */
  isAvailable(): boolean {
    return this.available;
  }

  // ── Raw client ──────────────────────────────────────────────────────────────

  /**
   * Returns the underlying ioredis client.
   *
   * Prefer the safe wrapper methods below for simple operations.
   * Use this only when you need pipelines, pub-sub, or other advanced APIs —
   * and wrap calls in `safeExecute()` or your own try/catch.
   */
  getClient(): Redis {
    return this.redis;
  }

  // ── Safe command wrappers ───────────────────────────────────────────────────

  /**
   * Execute a Redis command with automatic error catching.
   * Returns `fallback` if Redis is unavailable or the command throws.
   */
  async safeExecute<T>(
    operation: () => Promise<T>,
    fallback: T,
    context?: string,
  ): Promise<T> {
    if (!this.available) {
      this.logDown(`Skipping Redis operation${context ? ` (${context})` : ''} — Redis unavailable`);
      return fallback;
    }
    try {
      return await operation();
    } catch (err) {
      this.logger.warn(
        `Redis command failed${context ? ` (${context})` : ''}: ${(err as Error).message}`,
      );
      return fallback;
    }
  }

  async get(key: string): Promise<string | null> {
    return this.safeExecute(
      () => this.redis.get(key),
      null,
      `get ${key}`,
    );
  }

  async set(key: string, value: string): Promise<void> {
    await this.safeExecute(
      async () => { await this.redis.set(key, value); },
      undefined,
      `set ${key}`,
    );
  }

  async setex(key: string, ttlSeconds: number, value: string): Promise<void> {
    await this.safeExecute(
      async () => { await this.redis.setex(key, ttlSeconds, value); },
      undefined,
      `setex ${key}`,
    );
  }

  async del(...keys: string[]): Promise<number> {
    return this.safeExecute(
      () => this.redis.del(...keys),
      0,
      `del ${keys.join(', ')}`,
    );
  }

  async incr(key: string): Promise<number> {
    return this.safeExecute(
      () => this.redis.incr(key),
      0,
      `incr ${key}`,
    );
  }

  async decr(key: string): Promise<number> {
    return this.safeExecute(
      () => this.redis.decr(key),
      0,
      `decr ${key}`,
    );
  }

  async expire(key: string, seconds: number): Promise<number> {
    return this.safeExecute(
      () => this.redis.expire(key, seconds),
      0,
      `expire ${key}`,
    );
  }

  async ttl(key: string): Promise<number> {
    return this.safeExecute(
      () => this.redis.ttl(key),
      -2,
      `ttl ${key}`,
    );
  }

  async ping(): Promise<boolean> {
    return this.safeExecute(
      async () => (await this.redis.ping()) === 'PONG',
      false,
      'ping',
    );
  }

  /**
   * Retrieves Redis memory statistics via the INFO memory command.
   * Returns a zeroed-out stats object when Redis is unavailable instead of throwing.
   */
  async getMemoryInfo(): Promise<{
    usedMemoryBytes: number;
    maxMemoryBytes: number;
    usedMemoryHuman: string;
    maxMemoryHuman: string;
    usedMemoryRssBytes: number;
    memFragmentationRatio: number;
    usagePercent: number | null;
    unavailable?: boolean;
  }> {
    if (!this.available) {
      return this.unavailableMemoryStats();
    }

    try {
      const raw = await this.redis.info('memory');

      const parse = (key: string): string => {
        const match = raw.match(new RegExp(`^${key}:(.+)$`, 'm'));
        return match ? match[1].trim() : '0';
      };

      const usedMemoryBytes = parseInt(parse('used_memory'), 10);
      const maxMemoryBytes = parseInt(parse('maxmemory'), 10);
      const usedMemoryHuman = parse('used_memory_human');
      const maxMemoryHuman = parse('maxmemory_human');
      const usedMemoryRssBytes = parseInt(parse('used_memory_rss'), 10);
      const memFragmentationRatio = parseFloat(parse('mem_fragmentation_ratio'));

      // maxmemory == 0 means "no limit" — usage percentage is indeterminate
      const usagePercent =
        maxMemoryBytes > 0
          ? Math.round((usedMemoryBytes / maxMemoryBytes) * 100 * 100) / 100
          : null;

      return {
        usedMemoryBytes,
        maxMemoryBytes,
        usedMemoryHuman,
        maxMemoryHuman,
        usedMemoryRssBytes,
        memFragmentationRatio,
        usagePercent,
      };
    } catch (err) {
      this.logger.warn(`getMemoryInfo failed: ${(err as Error).message}`);
      return this.unavailableMemoryStats();
    }
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  /** Throttled logger so a flapping Redis doesn't spam the log. */
  private logDown(message: string): void {
    const now = Date.now();
    if (now - this.lastDownLogAt >= DOWN_LOG_THROTTLE_MS) {
      this.logger.error(message);
      this.lastDownLogAt = now;
    }
  }

  /** Safe zero-value memory stats returned when Redis is unreachable. */
  private unavailableMemoryStats() {
    return {
      usedMemoryBytes: 0,
      maxMemoryBytes: 0,
      usedMemoryHuman: 'N/A',
      maxMemoryHuman: 'N/A',
      usedMemoryRssBytes: 0,
      memFragmentationRatio: 0,
      usagePercent: null,
      unavailable: true,
    };
  }
}
