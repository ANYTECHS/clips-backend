import { Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { AppConfigService } from '../config/app-config.service';

@Injectable()
export class RedisService {
  private readonly logger = new Logger(RedisService.name);
  private readonly redis: Redis;

  constructor(appConfig: AppConfigService) {
    this.redis = new Redis({
      host: appConfig.redisHost,
      port: appConfig.redisPort,
      password: appConfig.redisPassword,
      lazyConnect: true,
    });

    this.redis.on('error', (err) => {
      this.logger.error(`Redis connection error: ${err.message}`);
    });

    this.redis.on('connect', () => {
      this.logger.log('Redis connected successfully');
    });
  }

  getClient(): Redis {
    return this.redis;
  }

  async get(key: string): Promise<string | null> {
    try {
      return await this.redis.get(key);
    } catch (err) {
      this.logger.warn(`Redis get failed for ${key}: ${(err as Error).message}`);
      return null;
    }
  }

  async setex(key: string, ttlSeconds: number, value: string): Promise<void> {
    try {
      await this.redis.setex(key, ttlSeconds, value);
    } catch (err) {
      this.logger.warn(
        `Redis setex failed for ${key}: ${(err as Error).message}`,
      );
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.redis.del(key);
    } catch (err) {
      this.logger.warn(
        `Redis del failed for ${key}: ${(err as Error).message}`,
      );
    }
  }

  async ping(): Promise<boolean> {
    try {
      const result = await this.redis.ping();
      return result === 'PONG';
    } catch {
      return false;
    }
  }

  /**
   * Retrieves Redis memory statistics via the INFO memory command.
   * Returns key memory fields in a structured format.
   */
  async getMemoryInfo(): Promise<{
    usedMemoryBytes: number;
    maxMemoryBytes: number;
    usedMemoryHuman: string;
    maxMemoryHuman: string;
    usedMemoryRssBytes: number;
    memFragmentationRatio: number;
    usagePercent: number | null;
  }> {
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
  }
}
