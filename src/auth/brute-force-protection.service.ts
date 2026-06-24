import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { AppConfigService } from '../config/app-config.service';

export interface BruteForceConfig {
  maxAttempts: number;
  lockoutDuration: number; // in seconds
  windowDuration: number; // time window for counting attempts
}

@Injectable()
export class BruteForceProtectionService {
  private readonly logger = new Logger(BruteForceProtectionService.name);
  private readonly config: BruteForceConfig;
  private readonly redis: ReturnType<RedisService['getClient']>;

  constructor(
    appConfig: AppConfigService,
    private redisService: RedisService,
  ) {
    this.redis = this.redisService.getClient();
    this.config = {
      maxAttempts: appConfig.bruteForceMaxAttempts,
      lockoutDuration: appConfig.bruteForceLockoutDuration,
      windowDuration: appConfig.bruteForceWindowDuration,
    };
  }

  async recordFailedAttempt(email: string): Promise<{
    isLocked: boolean;
    remainingAttempts: number;
    lockoutTimeLeft?: number;
  }> {
    const attemptKey = `login_attempts:${email}`;
    const lockoutKey = `login_locked:${email}`;

    try {
      // Check if already locked
      const lockoutTTL = await this.redis.ttl(lockoutKey);
      if (lockoutTTL > 0) {
        return {
          isLocked: true,
          remainingAttempts: 0,
          lockoutTimeLeft: lockoutTTL,
        };
      }

      // Increment failed attempts
      const attempts = await this.redis.incr(attemptKey);

      // Set expiry on first attempt
      if (attempts === 1) {
        await this.redis.expire(attemptKey, this.config.windowDuration);
      }

      const remainingAttempts = Math.max(0, this.config.maxAttempts - attempts);

      // Lock if max attempts reached
      if (attempts >= this.config.maxAttempts) {
        await this.redis.setex(lockoutKey, this.config.lockoutDuration, '1');
        await this.redis.del(attemptKey); // Clear attempts counter

        this.logger.warn(
          `Account locked for email: ${email} after ${attempts} failed attempts`,
        );

        return {
          isLocked: true,
          remainingAttempts: 0,
          lockoutTimeLeft: this.config.lockoutDuration,
        };
      }

      return {
        isLocked: false,
        remainingAttempts,
      };
    } catch (error) {
      this.logger.error('Error recording failed attempt:', error);
      // Fail open - allow login if Redis is down
      return {
        isLocked: false,
        remainingAttempts: this.config.maxAttempts - 1,
      };
    }
  }

  async clearFailedAttempts(email: string): Promise<void> {
    const attemptKey = `login_attempts:${email}`;
    const lockoutKey = `login_locked:${email}`;

    try {
      await this.redis.del(attemptKey, lockoutKey);
    } catch (error) {
      this.logger.error('Error clearing failed attempts:', error);
    }
  }

  async isAccountLocked(
    email: string,
  ): Promise<{ isLocked: boolean; lockoutTimeLeft?: number }> {
    const lockoutKey = `login_locked:${email}`;

    try {
      const lockoutTTL = await this.redis.ttl(lockoutKey);

      return {
        isLocked: lockoutTTL > 0,
        lockoutTimeLeft: lockoutTTL > 0 ? lockoutTTL : undefined,
      };
    } catch (error) {
      this.logger.error('Error checking lock status:', error);
      // Fail open - allow login if Redis is down
      return { isLocked: false };
    }
  }

  async getFailedAttempts(email: string): Promise<number> {
    const attemptKey = `login_attempts:${email}`;

    try {
      const attempts = await this.redis.get(attemptKey);
      return attempts ? parseInt(attempts, 10) : 0;
    } catch (error) {
      this.logger.error('Error getting failed attempts:', error);
      return 0;
    }
  }

}
