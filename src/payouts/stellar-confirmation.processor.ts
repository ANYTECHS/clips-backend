import { Processor, WorkerHost, InjectQueue, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger, OnModuleInit } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { PayoutsService } from './payouts.service';
import { MetricsService } from '../metrics/metrics.service';
import { GracefulShutdownService } from '../common/shutdown/graceful-shutdown.service';
import {
  STELLAR_CONFIRMATION_QUEUE,
  STELLAR_CONFIRMATION_JOB,
  STELLAR_CONFIRMATION_INTERVAL_MS,
} from './stellar-confirmation.queue';
import {
  handleFailedEvent,
  handleProcessingError,
} from '../queue/processor-error.handler';

@Processor(STELLAR_CONFIRMATION_QUEUE, { concurrency: 1 })
export class StellarConfirmationProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(StellarConfirmationProcessor.name);

  constructor(
    @InjectQueue(STELLAR_CONFIRMATION_QUEUE) private readonly queue: Queue,
    private readonly payoutsService: PayoutsService,
    private readonly metricsService: MetricsService,
    private readonly shutdownService: GracefulShutdownService,
  ) {
    super();
  }

  async onModuleInit(): Promise<void> {
    this.shutdownService.register(this.worker);
    this.shutdownService.registerQueue(this.queue);

    await this.queue.add(
      STELLAR_CONFIRMATION_JOB,
      {},
      {
        repeat: { every: STELLAR_CONFIRMATION_INTERVAL_MS },
        jobId: `${STELLAR_CONFIRMATION_JOB}-recurring`,
      },
    );
    this.logger.log(
      `Stellar confirmation poller scheduled every ${STELLAR_CONFIRMATION_INTERVAL_MS}ms`,
    );
  }

  async process(job: Job): Promise<void> {
    const jobMetricId = `${STELLAR_CONFIRMATION_QUEUE}:${job.id}`;
    this.logger.debug(
      `Running Stellar confirmation poll (job ${String(job.id)}) ` +
        JSON.stringify({ queue: STELLAR_CONFIRMATION_QUEUE, jobId: job.id }),
    );
    this.metricsService.recordJobStart(jobMetricId);

    try {
      await this.payoutsService.pollPendingStellarPayouts();
      this.metricsService.recordJobCompletion(jobMetricId, STELLAR_CONFIRMATION_QUEUE, 'success');
    } catch (error) {
      handleProcessingError(
        this.logger,
        this.metricsService,
        STELLAR_CONFIRMATION_QUEUE,
        job,
        jobMetricId,
        error,
      );
    }
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error): void {
    handleFailedEvent(this.logger, this.metricsService, STELLAR_CONFIRMATION_QUEUE, job, error, 5000);
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job): void {
    this.logger.debug(
      `Stellar confirmation poll ${String(job.id)} completed ` +
        JSON.stringify({ queue: STELLAR_CONFIRMATION_QUEUE, jobId: job.id }),
    );
  }
}
