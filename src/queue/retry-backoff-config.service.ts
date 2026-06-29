import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * BackoffConfig represents the exponential backoff strategy for job retries.
 */
export interface BackoffConfig {
  type: 'exponential' | 'fixed';
  /** Initial delay in milliseconds */
  delay: number;
  /** Optional multiplier for exponential backoff (default: 2) */
  multiplier?: number;
}

/**
 * RetryConfig represents the retry strategy for a specific queue or job type.
 */
export interface RetryConfig {
  /** Maximum number of attempts (including initial attempt) */
  attempts: number;
  /** Backoff strategy configuration */
  backoff: BackoffConfig;
}

/**
 * RetryBackoffConfigService centralizes and manages retry and backoff configuration
 * for all queue types. This ensures consistent retry behavior across the application
 * and allows for centralized configuration management.
 *
 * Configuration can be controlled via environment variables:
 *   - RETRY_BACKOFF_CLIP_GENERATION_ATTEMPTS
 *   - RETRY_BACKOFF_CLIP_GENERATION_DELAY_MS
 *   - RETRY_BACKOFF_CLIP_GENERATION_MULTIPLIER
 *   - RETRY_BACKOFF_NFT_MINT_ATTEMPTS
 *   - RETRY_BACKOFF_NFT_MINT_DELAY_MS
 *   - etc.
 *
 * Each queue type can have its own retry configuration.
 */
@Injectable()
export class RetryBackoffConfigService {
  private readonly logger = new Logger(RetryBackoffConfigService.name);

  // Define default configurations for each queue type
  private readonly defaultConfigs: Record<string, RetryConfig> = {
    'clip-generation': {
      attempts: 5,
      backoff: {
        type: 'exponential',
        delay: 2000,
        multiplier: 2,
      },
    },
    'nft-mint': {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 1000,
        multiplier: 2,
      },
    },
    'clip-posting': {
      attempts: 4,
      backoff: {
        type: 'exponential',
        delay: 1500,
        multiplier: 2,
      },
    },
    'email-delivery': {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 1000,
        multiplier: 2,
      },
    },
    'anomaly-detection': {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
        multiplier: 2,
      },
    },
  };

  constructor(private readonly configService: ConfigService) {
    this.logger.log('RetryBackoffConfigService initialized');
  }

  /**
   * Get the retry configuration for a specific queue type.
   * Configuration is resolved in the following order:
   *   1. Environment variables (most specific): RETRY_BACKOFF_{QUEUE_UPPER}_*
   *   2. Default configuration for the queue type
   *
   * @param queueName The name of the queue (e.g., 'clip-generation')
   * @returns RetryConfig for the queue
   */
  getRetryConfig(queueName: string): RetryConfig {
    const envPrefix = `RETRY_BACKOFF_${queueName.toUpperCase().replace(/-/g, '_')}`;

    const attempts = this.getIntFromEnv(
      `${envPrefix}_ATTEMPTS`,
      this.defaultConfigs[queueName]?.attempts,
      1,
    );

    const delayMs = this.getIntFromEnv(
      `${envPrefix}_DELAY_MS`,
      this.defaultConfigs[queueName]?.backoff.delay,
      0,
    );

    const multiplier = this.getIntFromEnv(
      `${envPrefix}_MULTIPLIER`,
      this.defaultConfigs[queueName]?.backoff.multiplier ?? 2,
      1,
    );

    const config: RetryConfig = {
      attempts,
      backoff: {
        type: 'exponential',
        delay: delayMs,
        multiplier,
      },
    };

    this.logger.debug(
      `Retry config for queue "${queueName}": ${JSON.stringify(config)}`,
    );

    return config;
  }

  /**
   * Get the retry configuration as a BullMQ-compatible format.
   * This format can be directly passed to BullMQ job options.
   *
   * @param queueName The name of the queue
   * @returns Configuration object compatible with BullMQ
   */
  getBullMQRetryConfig(
    queueName: string,
  ): {
    attempts: number;
    backoff: { type: string; delay: number };
  } {
    const config = this.getRetryConfig(queueName);

    return {
      attempts: config.attempts,
      backoff: {
        type: config.backoff.type,
        delay: config.backoff.delay,
      },
    };
  }

  /**
   * Get all available queue retry configurations.
   * Useful for displaying current retry settings in health/status endpoints.
   *
   * @returns Map of queue names to their retry configurations
   */
  getAllRetryConfigs(): Record<string, RetryConfig> {
    const configs: Record<string, RetryConfig> = {};

    for (const queueName of Object.keys(this.defaultConfigs)) {
      configs[queueName] = this.getRetryConfig(queueName);
    }

    return configs;
  }

  /**
   * Calculate the maximum total time a job can take with retries.
   * This is useful for setting timeouts and monitoring alerts.
   *
   * @param queueName The name of the queue
   * @returns Maximum total time in milliseconds
   */
  getMaxTotalJobTimeMs(queueName: string): number {
    const config = this.getRetryConfig(queueName);
    const { attempts, backoff } = config;

    // Calculate sum of all backoff delays: delay + (delay * multiplier) + (delay * multiplier^2) + ...
    let totalBackoffMs = 0;
    let currentDelay = backoff.delay;

    for (let i = 1; i < attempts; i++) {
      totalBackoffMs += currentDelay;
      currentDelay *= backoff.multiplier ?? 2;
    }

    return totalBackoffMs;
  }

  /**
   * Get detailed retry information for monitoring/debugging.
   *
   * @param queueName The name of the queue
   * @returns Object with detailed retry information
   */
  getRetryInfo(queueName: string) {
    const config = this.getRetryConfig(queueName);
    const maxTotalMs = this.getMaxTotalJobTimeMs(queueName);

    // Calculate delay for each attempt
    const delayPerAttempt: number[] = [];
    let currentDelay = config.backoff.delay;

    for (let i = 0; i < config.attempts - 1; i++) {
      delayPerAttempt.push(currentDelay);
      currentDelay *= config.backoff.multiplier ?? 2;
    }

    return {
      queue: queueName,
      maxAttempts: config.attempts,
      backoffType: config.backoff.type,
      initialDelayMs: config.backoff.delay,
      multiplier: config.backoff.multiplier ?? 2,
      delayPerAttemptMs: delayPerAttempt,
      totalBackoffTimeMs: maxTotalMs,
      description:
        `Jobs will be retried up to ${config.attempts} times with ` +
        `${config.backoff.type} backoff starting at ${config.backoff.delay}ms. ` +
        `Maximum total retry time: ${maxTotalMs}ms (${(maxTotalMs / 1000 / 60).toFixed(1)}m)`,
    };
  }

  private getIntFromEnv(
    key: string,
    fallback: number | undefined,
    minimum: number,
  ): number {
    const raw = this.configService.get<string>(key);

    if (!raw) {
      return fallback ?? minimum;
    }

    const value = Number(raw);
    if (!Number.isInteger(value) || value < minimum) {
      this.logger.warn(
        `Invalid value for ${key}: ${raw}. Using fallback: ${fallback ?? minimum}`,
      );
      return fallback ?? minimum;
    }

    return value;
  }
}
