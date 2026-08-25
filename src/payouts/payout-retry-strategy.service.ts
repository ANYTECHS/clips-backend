import { Injectable, Logger } from '@nestjs/common';

export interface RetryStrategy {
  attempt: number;
  delayMs: number;
  delayFormatted: string;
}

@Injectable()
export class PayoutRetryStrategyService {
  private readonly logger = new Logger(PayoutRetryStrategyService.name);
  private readonly maxRetries: number;
  private readonly baseDelayMs: number;

  constructor() {
    this.maxRetries = parseInt(process.env.PAYOUT_MAX_RETRIES ?? '3', 10);
    this.baseDelayMs = parseInt(
      process.env.PAYOUT_RETRY_BASE_DELAY_MS ?? '60000',
      10,
    ); // 1 minute default
  }

  /**
   * Get retry strategy for an attempt number (1-indexed)
   *
   * Default exponential backoff:
   * Attempt 1 (immediate) → 0ms (instant)
   * Attempt 2 → 1 minute (60000ms)
   * Attempt 3 → 2 minutes (120000ms)
   * Attempt 4 → 4 minutes (240000ms)
   * etc.
   */
  getRetryStrategy(attemptNumber: number): RetryStrategy {
    if (attemptNumber < 1) {
      throw new Error('Attempt number must be >= 1');
    }

    // First attempt is immediate (no delay)
    if (attemptNumber === 1) {
      return {
        attempt: attemptNumber,
        delayMs: 0,
        delayFormatted: 'immediate',
      };
    }

    // Exponential backoff: baseDelay * 2^(attempt-2)
    // Attempt 2: baseDelay * 2^0 = 1x
    // Attempt 3: baseDelay * 2^1 = 2x
    // Attempt 4: baseDelay * 2^2 = 4x
    const exponent = attemptNumber - 2;
    const delayMs = this.baseDelayMs * Math.pow(2, exponent);

    return {
      attempt: attemptNumber,
      delayMs: Math.min(delayMs, this.getMaxBackoffMs()),
      delayFormatted: this.formatDelay(delayMs),
    };
  }

  /**
   * Calculate the next retry timestamp
   */
  getNextRetryTime(attemptNumber: number): Date {
    const strategy = this.getRetryStrategy(attemptNumber);
    return new Date(Date.now() + strategy.delayMs);
  }

  /**
   * Check if an attempt should be retried
   */
  shouldRetry(attemptNumber: number): boolean {
    return attemptNumber <= this.maxRetries;
  }

  /**
   * Get maximum number of retries
   */
  getMaxRetries(): number {
    return this.maxRetries;
  }

  /**
   * Get maximum backoff to prevent excessive delays
   */
  private getMaxBackoffMs(): number {
    // Max 1 hour
    return parseInt(process.env.PAYOUT_MAX_BACKOFF_MS ?? '3600000', 10);
  }

  /**
   * Format delay in human-readable format
   */
  private formatDelay(delayMs: number): string {
    if (delayMs === 0) {
      return 'immediate';
    }

    const seconds = Math.floor(delayMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    }

    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }

    return `${seconds}s`;
  }

  /**
   * Create a detailed retry log entry
   */
  createRetryLog(
    payoutId: number,
    attemptNumber: number,
    error: string,
  ): {
    payoutId: number;
    attempt: number;
    error: string;
    nextRetry: Date | null;
    shouldRetry: boolean;
  } {
    const nextAttempt = attemptNumber + 1;
    const shouldRetry = this.shouldRetry(nextAttempt);

    return {
      payoutId,
      attempt: attemptNumber,
      error,
      nextRetry: shouldRetry ? this.getNextRetryTime(nextAttempt) : null,
      shouldRetry,
    };
  }
}
