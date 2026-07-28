import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import {
  EMAIL_DELIVERY_JOB,
  EMAIL_DELIVERY_QUEUE,
  EMAIL_JOB_OPTIONS,
  EmailDeliveryJobData,
} from './email-delivery.queue';
import { QueueOverflowService } from '../common/queue/queue-overflow.service';
import { getBullMQRateLimitConfig } from '../config/bullmq.config';

@Injectable()
export class EmailDeliveryService {
  private readonly logger = new Logger(EmailDeliveryService.name);

  constructor(
    @InjectQueue(EMAIL_DELIVERY_QUEUE)
    private readonly queue: Queue<EmailDeliveryJobData>,
    private readonly queueOverflowService: QueueOverflowService,
    private readonly configService: ConfigService,
  ) {}

  async enqueue(data: EmailDeliveryJobData): Promise<void> {
    const rateLimits = getBullMQRateLimitConfig(this.configService);

    const result = await this.queueOverflowService.enqueue({
      queue: this.queue as Queue<any>,
      jobName: EMAIL_DELIVERY_JOB,
      data,
      baseOptions: EMAIL_JOB_OPTIONS as Record<string, unknown>,
      rateLimitConfig: rateLimits.emailDelivery,
    });

    if (result.delayed) {
      this.logger.warn(
        `Email delivery job ${result.jobId} for ${data.to} (${data.template}) delayed by ${result.delayMs}ms due to queue overflow`,
      );
    } else {
      this.logger.log(`Queued email delivery for ${data.to} (${data.template})`);
    }
  }
}
