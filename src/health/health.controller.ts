import {
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiInternalServerErrorResponse,
} from '@nestjs/swagger';
import { RedisMemoryService, RedisMemoryStats } from './redis-memory.service';
import { RedisService } from '../redis/redis.service';
import { QueueHealthService } from '../queue/queue-health.service';
import {
  QueueHealthResponseDto,
  QueueStatisticsResponseDto,
} from '../queue/dtos/queue-stats.dto';

interface HealthResponse {
  status: 'ok' | 'degraded';
  stats: RedisMemoryStats;
}

interface RedisHealthResponse {
  status: 'ok' | 'degraded';
  connected: boolean;
  latencyMs: number | null;
}

@ApiTags('health')
@ApiInternalServerErrorResponse({ description: 'Internal server error' })
@Controller('health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(
    private readonly redisMemoryService: RedisMemoryService,
    private readonly redisService: RedisService,
    private readonly queueHealthService: QueueHealthService,
  ) {}

  /**
   * Returns current Redis memory utilisation.
   * Responds with HTTP 200 when usage is within safe bounds and
   * HTTP 503 when usage exceeds the 80 % alert threshold.
   */
  @Get('redis-memory')
  @ApiOperation({
    summary: 'Redis memory health check',
    description:
      'Returns Redis memory stats. Status is "degraded" and HTTP 503 is returned when usage exceeds 80%.',
  })
  @ApiResponse({
    status: 200,
    description: 'Redis memory usage is within normal bounds.',
  })
  @ApiResponse({
    status: 503,
    description: 'Redis memory usage exceeds the 80% alert threshold.',
  })
  async checkRedisMemory(): Promise<HealthResponse> {
    let stats: RedisMemoryStats;
    try {
      stats = await this.redisMemoryService.getStats();
    } catch (err) {
      this.logger.error(
        `Redis memory health check threw unexpectedly: ${(err as Error).message}`,
      );
      // Surface as 503 so monitoring tools can detect and alert on it
      throw new HttpException(
        {
          status: 'degraded',
          alert: `Unable to retrieve Redis memory stats: ${(err as Error).message}`,
          unavailable: true,
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    // Redis is unreachable — return 503 with a clear unavailable indicator
    if (stats.unavailable) {
      this.logger.warn('Redis memory health check: Redis unavailable');
      throw new HttpException(
        { status: 'degraded' as const, stats },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    if (stats.isAboveThreshold) {
      this.logger.warn('Redis memory health check returned degraded status', {
        usagePercent: stats.usagePercent,
        alert: stats.alert,
      });
      throw new HttpException(
        { status: 'degraded' as const, stats },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    return { status: 'ok', stats };
  }

  @Get('redis')
  @ApiOperation({
    summary: 'Redis connection health check',
    description: 'Returns Redis connection status and round-trip latency.',
  })
  @ApiResponse({ status: 200, description: 'Redis is reachable.' })
  @ApiResponse({ status: 503, description: 'Redis is unreachable.' })
  async checkRedis(): Promise<RedisHealthResponse> {
    const start = Date.now();
    const connected = await this.redisService.ping();
    const latencyMs = connected ? Date.now() - start : null;

    if (!connected) {
      this.logger.warn('Redis health check: Redis unreachable');
      throw new HttpException(
        { status: 'degraded', connected: false, latencyMs: null },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    return { status: 'ok', connected: true, latencyMs };
  }

  @Get('queues')
  @ApiOperation({
    summary: 'Queue health check',
    description:
      'Returns health metrics for all BullMQ queues including job counts, failure rates, and overall status.',
  })
  @ApiResponse({
    status: 200,
    description: 'Queue health metrics retrieved successfully.',
    type: QueueHealthResponseDto,
  })
  @ApiResponse({
    status: 503,
    description: 'One or more queues are unavailable.',
  })
  async checkQueueHealth(): Promise<QueueHealthResponseDto> {
    try {
      const health = await this.queueHealthService.getQueueHealth();

      if (health.status === 'unhealthy') {
        throw new HttpException(health, HttpStatus.SERVICE_UNAVAILABLE);
      }

      return health;
    } catch (err) {
      this.logger.error(`Queue health check failed: ${(err as Error).message}`);

      if (err instanceof HttpException) {
        throw err;
      }

      throw new HttpException(
        {
          status: 'degraded',
          message: 'Queue health check failed',
          error: (err as Error).message,
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  @Get('queues/statistics')
  @ApiOperation({
    summary: 'Queue statistics',
    description:
      'Returns detailed statistics for all BullMQ queues including job counts, processing times, and failure analysis.',
  })
  @ApiResponse({
    status: 200,
    description: 'Queue statistics retrieved successfully.',
    type: QueueStatisticsResponseDto,
  })
  async getQueueStatistics(): Promise<QueueStatisticsResponseDto> {
    try {
      return await this.queueHealthService.getQueueStatistics();
    } catch (err) {
      this.logger.error(
        `Queue statistics retrieval failed: ${(err as Error).message}`,
      );
      throw new HttpException(
        {
          message: 'Failed to retrieve queue statistics',
          error: (err as Error).message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
