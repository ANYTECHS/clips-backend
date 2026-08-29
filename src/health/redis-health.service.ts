import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

export type RedisHealthStatus = 'healthy' | 'unhealthy';

export interface RedisHealthResult {
  status: RedisHealthStatus;
  service: 'redis';
  connected?: boolean;
  latencyMs?: number | null;
  message?: string;
}

@Injectable()
export class RedisHealthService {
  private readonly logger = new Logger(RedisHealthService.name);

  constructor(private readonly redisService: RedisService) {}

  async check(): Promise<RedisHealthResult> {
    const startedAt = Date.now();

    try {
      const connected = await this.redisService.ping();
      const latencyMs = connected ? Date.now() - startedAt : null;

      if (!connected) {
        const result: RedisHealthResult = {
          status: 'unhealthy',
          service: 'redis',
          connected: false,
          latencyMs: null,
          message: 'Redis ping failed',
        };

        this.logger.warn('Redis health check failed: ping returned false');
        return result;
      }

      return {
        status: 'healthy',
        service: 'redis',
        connected: true,
        latencyMs,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown Redis error';

      this.logger.error(`Redis health check threw: ${message}`);

      return {
        status: 'unhealthy',
        service: 'redis',
        connected: false,
        latencyMs: null,
        message,
      };
    }
  }
}
