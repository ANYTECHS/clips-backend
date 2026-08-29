import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bullmq';
import { PayoutsService } from './payouts.service';
import { MetricsService } from '../metrics/metrics.service';
import { PAYOUT_RETRY_QUEUE } from './payout-retry.queue';
import { getBullMQWorkerConfig } from '../config/bullmq.config';

interface PayoutRetryJob {
  payoutId: number;
}

@Processor(PAYOUT_RETRY_QUEUE, {
  concurrency: getBullMQWorkerConfig(new ConfigService()).payoutRetryConcurrency,
})
export class PayoutRetryProcessor extends WorkerHost {
  private readonly logger = new Logger(PayoutRetryProcessor.name);

  constructor(
    private payoutsService: PayoutsService,
    private metricsService: MetricsService,
  ) {
    super();
  }

  async process(job: Job<PayoutRetryJob>): Promise<void> {
    const { payoutId } = job.data;
    this.logger.log(`Processing payout retry for payout ${payoutId}`);

    const jobMetricId = `${PAYOUT_RETRY_QUEUE}:${job.id}`;
    this.metricsService.recordJobStart(jobMetricId);

    try {
      await this.payoutsService.processPayout(payoutId);

      this.metricsService.recordJobCompletion(
        jobMetricId,
        PAYOUT_RETRY_QUEUE,
        'success',
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `[payout-retry] job ${job.id} failed for payout ${payoutId}: ${message}`,
        error instanceof Error ? error.stack : undefined,
      );
      this.metricsService.recordJobCompletion(
        jobMetricId,
        PAYOUT_RETRY_QUEUE,
        'failure',
      );
      this.metricsService.recordJobFailure(
        PAYOUT_RETRY_QUEUE,
        message,
      );
      throw error;
    }
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<PayoutRetryJob>, error: Error): void {
    const maxAttempts = job.opts.attempts ?? 1;
    const isFinalAttempt = job.attemptsMade >= maxAttempts;

    if (!isFinalAttempt) {
      this.logger.warn(
        `[RETRY] Payout retry job ${job.id} failed on attempt ${job.attemptsMade}/${maxAttempts} — ` +
          `payoutId=${job.data.payoutId} — reason: ${error.message} — retrying`,
      );
      return;
    }

    this.logger.error(
      `[FINAL FAILURE] Payout retry job ${job.id} exhausted all ${maxAttempts} attempts — ` +
        `payoutId=${job.data.payoutId} — reason: ${error.message}`,
      error.stack,
    );
    this.metricsService.recordJobFailure(PAYOUT_RETRY_QUEUE, 'final_failure');
  }
}
