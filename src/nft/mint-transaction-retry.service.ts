import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NftMintStatusService } from './nft-mint-status.service';

export interface RetryDecision {
  /** Whether another attempt should be scheduled. */
  shouldRetry: boolean;
  /** The attempt number that would be next (1-indexed). */
  attempt: number;
  /** Milliseconds to wait before the next attempt. */
  delayMs: number;
  /** Human-readable delay string (e.g. "30s", "2m 0s"). */
  delayFormatted: string;
  /** Absolute timestamp of the next allowed retry, null when not retrying. */
  nextRetryAt: Date | null;
  /** True when max retries have been exhausted and the failure is permanent. */
  isPermanentFailure: boolean;
}

/**
 * MintTransactionRetryService
 *
 * Manages retry logic for failed NFT mint transactions.
 * Uses exponential backoff (baseDelay × 2^(attempt-1)) with a configurable
 * cap and maximum retry count.
 *
 * Features:
 * - Exponential backoff with configurable base delay and max cap
 * - Duplicate submission prevention (checks submit/confirm stages)
 * - Permanent failure marking after max retries are exhausted
 * - Backoff window checking (isEligibleForRetry)
 *
 * Environment variables:
 *   MINT_MAX_RETRIES             — maximum retry attempts (default: 5)
 *   MINT_RETRY_BASE_DELAY_MS     — base backoff delay in ms (default: 30000 = 30s)
 *   MINT_MAX_BACKOFF_MS          — maximum backoff cap in ms (default: 3600000 = 1h)
 *
 * Closes #847.
 */
@Injectable()
export class MintTransactionRetryService {
  private readonly logger = new Logger(MintTransactionRetryService.name);
  private readonly maxRetries: number;
  private readonly baseDelayMs: number;
  private readonly maxBackoffMs: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mintStatusService: NftMintStatusService,
  ) {
    this.maxRetries = parseInt(process.env.MINT_MAX_RETRIES ?? '5', 10);
    this.baseDelayMs = parseInt(
      process.env.MINT_RETRY_BASE_DELAY_MS ?? '30000',
      10,
    );
    this.maxBackoffMs = parseInt(
      process.env.MINT_MAX_BACKOFF_MS ?? '3600000',
      10,
    );
  }

  /**
   * Decide whether a clip mint should be retried after a failure, and update
   * the DB accordingly.
   *
   * When retries are exhausted the status is marked as permanently failed.
   * Otherwise the failure is recorded and the retry counter + next retry
   * timestamp are persisted.
   *
   * @param clipId        - Clip ID that failed to mint
   * @param failureReason - Human-readable description of the failure
   * @returns             RetryDecision describing what happens next
   */
  async handleFailure(clipId: number, failureReason: string): Promise<RetryDecision> {
    const status = await this.mintStatusService.getOrCreate(clipId);

    const nextAttempt = status.retryCount + 1;
    const shouldRetry = nextAttempt <= this.maxRetries;

    if (!shouldRetry) {
      // Max retries exhausted → permanent failure
      await this.mintStatusService.markFailed(clipId, failureReason, true);
      this.logger.warn(
        `Clip ${clipId} mint permanently failed after ${status.retryCount} attempt(s): ${failureReason}`,
      );
      return {
        shouldRetry: false,
        attempt: nextAttempt,
        delayMs: 0,
        delayFormatted: 'n/a',
        nextRetryAt: null,
        isPermanentFailure: true,
      };
    }

    const delayMs = this.calculateDelay(nextAttempt);
    const nextRetryAt = new Date(Date.now() + delayMs);

    // Mark as (non-permanent) failed, then record retry metadata
    await this.mintStatusService.markFailed(clipId, failureReason, false);
    await this.mintStatusService.recordRetryAttempt(clipId, nextRetryAt);

    this.logger.log(
      `Clip ${clipId} mint failed (attempt ${nextAttempt}/${this.maxRetries}). ` +
        `Next retry in ${this.formatDelay(delayMs)} at ${nextRetryAt.toISOString()}.`,
    );

    return {
      shouldRetry: true,
      attempt: nextAttempt,
      delayMs,
      delayFormatted: this.formatDelay(delayMs),
      nextRetryAt,
      isPermanentFailure: false,
    };
  }

  /**
   * Check whether a clip mint is eligible for an immediate retry.
   *
   * Returns false when:
   * - No status record exists
   * - The transaction is permanently failed
   * - The mint already succeeded (stage = 'confirm')
   * - The stage is not 'fail' (still in progress)
   * - The backoff window has not yet elapsed
   */
  async isEligibleForRetry(clipId: number): Promise<boolean> {
    const status = await this.prisma.nftMintStatus.findUnique({
      where: { clipId },
    });

    if (!status) return false;
    if (status.permanentFailure) return false;
    if (status.stage === 'confirm') return false; // already confirmed
    if (status.stage !== 'fail') return false; // not in a failed state
    if (status.nextRetryAt && status.nextRetryAt > new Date()) return false; // still in backoff

    return true;
  }

  /**
   * Prevent duplicate transaction submission.
   * Returns true when a transaction is already in the submit or confirm
   * stage — re-submitting would create a duplicate on-chain transaction.
   */
  async isDuplicateSubmission(clipId: number): Promise<boolean> {
    const status = await this.prisma.nftMintStatus.findUnique({
      where: { clipId },
    });

    if (!status) return false;
    return status.stage === 'submit' || status.stage === 'confirm';
  }

  /** Returns the configured maximum number of retry attempts. */
  getMaxRetries(): number {
    return this.maxRetries;
  }

  /**
   * Exponential backoff: baseDelay × 2^(attempt-1), capped at maxBackoffMs.
   *
   * Attempt 1 → baseDelay × 1  (e.g. 30 s)
   * Attempt 2 → baseDelay × 2  (e.g. 60 s)
   * Attempt 3 → baseDelay × 4  (e.g. 2 m)
   * Attempt 4 → baseDelay × 8  (e.g. 4 m)
   * ...
   */
  calculateDelay(attempt: number): number {
    if (attempt < 1) return 0;
    const delay = this.baseDelayMs * Math.pow(2, attempt - 1);
    return Math.min(delay, this.maxBackoffMs);
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private formatDelay(ms: number): string {
    if (ms === 0) return 'immediate';
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  }
}
