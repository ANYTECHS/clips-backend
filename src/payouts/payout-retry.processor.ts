import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bullmq';
import { PayoutsService } from './payouts.service';
import { MetricsService } from '../metrics/metrics.service';
import { PAYOUT_RETRY_QUEUE } from './payout-retry.queue';
import { getBullMQWorkerConfig } from '../config/bullmq.config';
import { GracefulShutdownService } from '../common/shutdown/graceful-shutdown.service';
import { handleFailedEvent, handleProcessingError } from '../queue/processor-error.handler';

interface PayoutRetryJob {
  payoutId: number;
}

@Processor(PAYOUT_RETRY_QUEUE, {
  concurrency: getBullMQWorkerConfig(new ConfigService()).payoutRetryConcurrency,
})
export class PayoutRetryProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(PayoutRetryProcessor.name);

  constructor(
    private payoutsService: PayoutsService,
    private metricsService: MetricsService,
    private readonly shutdownService: GracefulShutdownService,
  ) {
    super();
  }

  onModuleInit(): void {
    this.shutdownService.register(this.worker);
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
      handleProcessingError(
        this.logger,
        this.metricsService,
        PAYOUT_RETRY_QUEUE,
        job,
        jobMetricId,
        error,
      );
    }
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<PayoutRetryJob>, error: Error): void {
    // Standardized retry vs final logging + final_failure metric (Issue #1235).
    handleFailedEvent(this.logger, this.metricsService, PAYOUT_RETRY_QUEUE, job, error, 5000);
  }
}
