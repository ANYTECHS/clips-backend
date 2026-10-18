import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../redis/redis.service';

export interface BruteForceConfig {
  maxAttempts: number;
  lockoutDuration: number; // in seconds
  windowDuration: number;  // time window for counting attempts
}

/**
 * BruteForceProtectionService
 *
 * Tracks failed login attempts in Redis and locks accounts temporarily
 * once the attempt threshold is reached.
 *
 * Resilience: every Redis operation goes through RedisService's safe
 * wrappers. When Redis is unavailable the service fails open — login is
 * allowed and no false lockouts are applied — rather than taking down
 * the entire auth flow with a 500 error.
 */
@Injectable()
export class BruteForceProtectionService {
  private readonly logger = new Logger(BruteForceProtectionService.name);
  private readonly config: BruteForceConfig;

  constructor(
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
  ) {
    this.config = {
      maxAttempts: this.configService.get<number>('BRUTE_FORCE_MAX_ATTEMPTS', 5),
      lockoutDuration: this.configService.get<number>('BRUTE_FORCE_LOCKOUT_DURATION', 900),
      windowDuration: this.configService.get<number>('BRUTE_FORCE_WINDOW_DURATION', 900),
    };
  }

  async recordFailedAttempt(email: string): Promise<{
    isLocked: boolean;
    remainingAttempts: number;
    lockoutTimeLeft?: number;
  }> {
    // Fast-path: fail open when Redis is known down
    if (!this.redisService.isAvailable()) {
      this.logger.warn('Redis unavailable — brute-force protection bypassed (fail open)');
      return { isLocked: false, remainingAttempts: this.config.maxAttempts - 1 };
    }

    const attemptKey = `login_attempts:${email}`;
    const lockoutKey = `login_locked:${email}`;

    try {
      // Check if already locked
      const lockoutTTL = await this.redisService.ttl(lockoutKey);
      if (lockoutTTL > 0) {
        return { isLocked: true, remainingAttempts: 0, lockoutTimeLeft: lockoutTTL };
      }

      // Increment failed attempts using safe wrapper
      const attempts = await this.redisService.incr(attemptKey);

      // Set expiry on first attempt
      if (attempts === 1) {
        await this.redisService.expire(attemptKey, this.config.windowDuration);
      }

      const remainingAttempts = Math.max(0, this.config.maxAttempts - attempts);

      // Lock account if threshold reached
      if (attempts >= this.config.maxAttempts) {
        await this.redisService.setex(lockoutKey, this.config.lockoutDuration, '1');
        await this.redisService.del(attemptKey);

        this.logger.warn(
          `Account locked for email: ${email} after ${attempts} failed attempts`,
        );

        return {
          isLocked: true,
          remainingAttempts: 0,
          lockoutTimeLeft: this.config.lockoutDuration,
        };
      }

      return { isLocked: false, remainingAttempts };
    } catch (error) {
      this.logger.error('Error recording failed attempt:', error);
      // Fail open — allow login if Redis throws unexpectedly
      return { isLocked: false, remainingAttempts: this.config.maxAttempts - 1 };
    }
  }

  async clearFailedAttempts(email: string): Promise<void> {
    if (!this.redisService.isAvailable()) return;

    const attemptKey = `login_attempts:${email}`;
    const lockoutKey = `login_locked:${email}`;

    try {
      await this.redisService.del(attemptKey, lockoutKey);
    } catch (error) {
      this.logger.error('Error clearing failed attempts:', error);
    }
  }

  async isAccountLocked(
    email: string,
  ): Promise<{ isLocked: boolean; lockoutTimeLeft?: number }> {
    // Fail open when Redis is unavailable
    if (!this.redisService.isAvailable()) {
      return { isLocked: false };
    }

    const lockoutKey = `login_locked:${email}`;

    try {
      const lockoutTTL = await this.redisService.ttl(lockoutKey);
      return {
        isLocked: lockoutTTL > 0,
        lockoutTimeLeft: lockoutTTL > 0 ? lockoutTTL : undefined,
      };
    } catch (error) {
      this.logger.error('Error checking lock status:', error);
      return { isLocked: false };
    }
  }

  async getFailedAttempts(email: string): Promise<number> {
    if (!this.redisService.isAvailable()) return 0;

    const attemptKey = `login_attempts:${email}`;

    try {
      const attempts = await this.redisService.get(attemptKey);
      return attempts ? parseInt(attempts, 10) : 0;
    } catch (error) {
      this.logger.error('Error getting failed attempts:', error);
      return 0;
    }
  }
}
