import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { MailService } from '../auth/mail.service';
import { EMAIL_DELIVERY_QUEUE } from '../auth/email-delivery.queue';

/**
 * Service responsible for notifying administrators when a job has permanently failed
 * (i.e., exhausted all retry attempts) in any BullMQ queue.
 *
 * The service uses the existing MailService to send an email to a configurable
 * admin address. The email contains basic information about the failed job such
 * as queue name, job id, attempts made, and the error message.
 */
@Injectable()
export class FailedJobNotificationService {
  private readonly logger = new Logger(FailedJobNotificationService.name);

  constructor(private readonly mailService: MailService) {}

  /**
   * Send a notification about a permanently failed job.
   *
   * @param queueName - Name of the BullMQ queue where the failure occurred.
   * @param job - The BullMQ job instance that has failed.
   */
  async notify(queueName: string, job: Job<any, any, string>): Promise<void> {
    const adminEmail = process.env.ADMIN_ALERT_EMAIL;
    if (!adminEmail) {
      this.logger.warn('ADMIN_ALERT_EMAIL not set – skipped failed job notification');
      return;
    }

    const subject = `[Alert] Job failed permanently in ${queueName}`;
    const text = `
A job has permanently failed after exhausting all retries.

Queue: ${queueName}
Job ID: ${job.id}
Attempts: ${job.attemptsMade}
Error: ${job.failedReason ?? 'N/A'}
Timestamp: ${new Date().toISOString()}
`;

    try {
      await this.mailService.sendEmail({
        to: adminEmail,
        subject,
        text,
      });
      this.logger.log(`Failed job notification sent to ${adminEmail} for job ${job.id}`);
    } catch (error) {
      this.logger.error('Failed to send job failure notification', error);
    }
  }
}
