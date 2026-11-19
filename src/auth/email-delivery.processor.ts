import { Logger, OnModuleInit } from '@nestjs/common';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bullmq';
import { MailService } from './mail.service';
import { MetricsService } from '../metrics/metrics.service';
import {
  EMAIL_DELIVERY_QUEUE,
  EmailDeliveryJobData,
} from './email-delivery.queue';
import { getBullMQWorkerConfig } from '../config/bullmq.config';
import { GracefulShutdownService } from '../common/shutdown/graceful-shutdown.service';
import { handleFailedEvent, handleProcessingError } from '../queue/processor-error.handler';

/**
 * BullMQ processor for email delivery jobs.
 *
 * Worker concurrency is controlled by BULLMQ_EMAIL_DELIVERY_CONCURRENCY env var.
 * Default: 5 concurrent jobs (email sending is I/O-bound and can handle more parallelism)
 */
@Processor(EMAIL_DELIVERY_QUEUE, {
  concurrency: getBullMQWorkerConfig(new ConfigService()).emailDeliveryConcurrency,
})
export class EmailDeliveryProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(EmailDeliveryProcessor.name);

  constructor(
    private readonly mailService: MailService,
    private readonly metricsService: MetricsService,
    private readonly shutdownService: GracefulShutdownService,
  ) {
    super();
    const config = getBullMQWorkerConfig(new ConfigService());
    this.logger.log(
      `Email delivery worker initialized with concurrency: ${config.emailDeliveryConcurrency}`,
    );
  }

  onModuleInit(): void {
    this.shutdownService.register(this.worker);
  }

  async process(job: Job<EmailDeliveryJobData>): Promise<void> {
    this.logger.log(
      `Processing email job ${job.id} — attempt ${job.attemptsMade + 1}/${job.opts.attempts ?? 1} ` +
        `to=${job.data.to} template=${job.data.template}`,
    );

    const jobMetricId = `${EMAIL_DELIVERY_QUEUE}:${job.id}`;
    this.metricsService.recordJobStart(jobMetricId);

    try {
      await this.mailService.sendTemplatedEmail(job.data);
      this.metricsService.recordJobCompletion(jobMetricId, EMAIL_DELIVERY_QUEUE, 'success');
    } catch (error) {
      handleProcessingError(
        this.logger,
        this.metricsService,
        EMAIL_DELIVERY_QUEUE,
        job,
        jobMetricId,
        error,
      );
    }
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<EmailDeliveryJobData>, error: Error): void {
    // Standardized retry vs final logging + final_failure metric (Issue #1235).
    handleFailedEvent(this.logger, this.metricsService, EMAIL_DELIVERY_QUEUE, job, error, 500);
  }
}
