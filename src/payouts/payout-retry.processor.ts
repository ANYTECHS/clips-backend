import { Processor, WorkerHost } from '@nestjs/bullmq';
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
      this.logger.error(
        `Payout retry failed for payout ${payoutId}:`,
        error,
      );
      this.metricsService.recordJobCompletion(
        jobMetricId,
        PAYOUT_RETRY_QUEUE,
        'failure',
      );
      this.metricsService.recordJobFailure(
        PAYOUT_RETRY_QUEUE,
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    }
  }
}
