import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Logger, OnModuleInit } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { PayoutsService } from './payouts.service';
import {
  STELLAR_CONFIRMATION_QUEUE,
  STELLAR_CONFIRMATION_JOB,
  STELLAR_CONFIRMATION_INTERVAL_MS,
} from './stellar-confirmation.queue';

@Processor(STELLAR_CONFIRMATION_QUEUE, { concurrency: 1 })
export class StellarConfirmationProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(StellarConfirmationProcessor.name);

  constructor(
    @InjectQueue(STELLAR_CONFIRMATION_QUEUE) private readonly queue: Queue,
    private readonly payoutsService: PayoutsService,
  ) {
    super();
  }

  async onModuleInit(): Promise<void> {
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
    this.logger.debug(`Running Stellar confirmation poll (job ${job.id})`);
    await this.payoutsService.pollPendingStellarPayouts();
  }
}
