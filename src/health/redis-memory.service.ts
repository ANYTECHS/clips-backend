import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { RedisService } from '../redis/redis.service';

export interface RedisMemoryStats {
  usedMemoryBytes: number;
  maxMemoryBytes: number;
  usedMemoryHuman: string;
  maxMemoryHuman: string;
  usedMemoryRssBytes: number;
  memFragmentationRatio: number;
  /** null when Redis has no memory limit configured */
  usagePercent: number | null;
  isAboveThreshold: boolean;
  alert: string | null;
  checkedAt: string;
  /** true when Redis is unreachable and stats could not be collected */
  unavailable?: boolean;
}

export const MEMORY_ALERT_THRESHOLD_PERCENT = 80;

/** Periodic log interval: every 5 minutes */
const LOG_INTERVAL_MS = 5 * 60 * 1000;

@Injectable()
export class RedisMemoryService {
  private readonly logger = new Logger(RedisMemoryService.name);

  constructor(private readonly redisService: RedisService) {}

  /**
   * Collects current Redis memory stats, evaluates the alert threshold,
   * and returns a structured payload.
   *
   * When Redis is unavailable the method returns a degraded-but-safe object
   * with `unavailable: true` instead of throwing, so callers can distinguish
   * "no data" from "high memory".
   */
  async getStats(): Promise<RedisMemoryStats> {
    // Check availability before issuing any command
    if (!this.redisService.isAvailable()) {
      return this.unavailableStats('Redis is not connected');
    }

    try {
      const info = await this.redisService.getMemoryInfo();

      // getMemoryInfo itself can return an unavailable sentinel
      if (info.unavailable) {
        return this.unavailableStats('Redis returned no data');
      }

      const isAboveThreshold =
        info.usagePercent !== null &&
        info.usagePercent > MEMORY_ALERT_THRESHOLD_PERCENT;

      const alert = isAboveThreshold
        ? `Redis memory usage is at ${info.usagePercent}%, exceeding the ${MEMORY_ALERT_THRESHOLD_PERCENT}% threshold. OOM risk is elevated.`
        : null;

      return {
        ...info,
        isAboveThreshold,
        alert,
        checkedAt: new Date().toISOString(),
      };
    } catch (err) {
      return this.unavailableStats((err as Error).message);
    }
  }

  /**
   * Runs on a fixed interval to log Redis memory statistics.
   * Emits a warning when usage exceeds the configured threshold or when
   * Redis is unavailable.
   */
  @Interval(LOG_INTERVAL_MS)
  async logMemoryStats(): Promise<void> {
    try {
      const stats = await this.getStats();

      if (stats.unavailable) {
        this.logger.warn('Redis memory stats unavailable — Redis may be down');
        return;
      }

      const logPayload = {
        usedMemory: stats.usedMemoryHuman,
        maxMemory: stats.maxMemoryHuman,
        usagePercent: stats.usagePercent,
        memFragmentationRatio: stats.memFragmentationRatio,
        alert: stats.alert,
      };

      if (stats.isAboveThreshold) {
        this.logger.warn('Redis memory usage above alert threshold', logPayload);
      } else {
        this.logger.log('Redis memory stats', logPayload);
      }
    } catch (err) {
      this.logger.error(`Failed to collect Redis memory stats: ${(err as Error).message}`);
    }
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private unavailableStats(reason: string): RedisMemoryStats {
    return {
      usedMemoryBytes: 0,
      maxMemoryBytes: 0,
      usedMemoryHuman: 'N/A',
      maxMemoryHuman: 'N/A',
      usedMemoryRssBytes: 0,
      memFragmentationRatio: 0,
      usagePercent: null,
      isAboveThreshold: false,
      alert: `Redis unavailable: ${reason}`,
      checkedAt: new Date().toISOString(),
      unavailable: true,
    };
  }
}
