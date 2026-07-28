import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { CLIP_GENERATION_QUEUE } from '../clips/clip-generation.queue';
import { CLIP_POSTING_QUEUE } from '../clips/clip-posting.queue';
import { PAYOUT_RETRY_QUEUE } from '../payouts/payout-retry.queue';
import { MailService } from '../auth/mail.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class JobFailureNotifierService implements OnModuleInit {
  private readonly logger = new Logger(JobFailureNotifierService.name);
  private readonly adminEmail = process.env.ADMIN_EMAIL || 'admin@example.com';
  private readonly slackWebhookUrl = process.env.SLACK_WEBHOOK_URL;

  constructor(
    @InjectQueue(CLIP_GENERATION_QUEUE)
    private clipGenerationQueue: Queue,
    @InjectQueue(CLIP_POSTING_QUEUE)
    private clipPostingQueue: Queue,
    @InjectQueue(PAYOUT_RETRY_QUEUE)
    private payoutRetryQueue: Queue,
    private mailService: MailService,
    private prisma: PrismaService,
  ) {}

  onModuleInit() {
    this.setupFailureListeners();
  }

  private setupFailureListeners() {
    const listenForFailures = (queue: Queue, jobType: string) => {
      (queue as unknown as {
        on(
          event: 'failed',
          handler: (job: { id?: string; attemptsMade?: number; opts?: { attempts?: number }; data?: unknown } | undefined, error: Error) => void,
        ): void;
      }).on('failed', async (job, error) => {
        const isFinalAttempt = job && (job.attemptsMade ?? 0) >= (job.opts?.attempts || 3);
        if (isFinalAttempt) {
          await this.handleCriticalFailure(jobType, job!.id, job!.data, error);
        } else {
          await this.sendSlackNotification(jobType, job?.id, job?.data, error, false);
        }
      });
    };

    listenForFailures(this.clipGenerationQueue, 'Clip Generation');
    listenForFailures(this.clipPostingQueue, 'Clip Posting');
    listenForFailures(this.payoutRetryQueue, 'Payout');

    this.logger.log('Job failure listeners initialized');
  }

  private async handleCriticalFailure(
    jobType: string,
    jobId: string | undefined,
    jobData: any,
    error: Error,
  ) {
    this.logger.error(
      `Critical failure in ${jobType} job ${jobId}: ${error.message}`,
    );

    try {
      await Promise.all([
        this.sendAdminNotification(jobType, jobId, jobData, error),
        this.sendSlackNotification(jobType, jobId, jobData, error, true),
      ]);

      if (jobType === 'Payout' && jobData?.payoutId) {
        await this.sendUserNotification(jobData.payoutId, error);
      }
    } catch (notificationError) {
      this.logger.error(
        'Failed to send failure notification',
        notificationError,
      );
    }
  }

  private async sendAdminNotification(
    jobType: string,
    jobId: string | undefined,
    jobData: any,
    error: Error,
  ) {
    const subject = `Critical Job Failure: ${jobType}`;
    const html = `
      <h2>Job Failure Alert</h2>
      <p><strong>Job Type:</strong> ${jobType}</p>
      <p><strong>Job ID:</strong> ${jobId || 'Unknown'}</p>
      <p><strong>Error:</strong> ${error.message}</p>
      <p><strong>Stack:</strong></p>
      <pre>${error.stack || 'No stack trace available'}</pre>
      <p><strong>Job Data:</strong></p>
      <pre>${JSON.stringify(jobData, null, 2)}</pre>
    `;

    await this.mailService.sendEmail({
      to: this.adminEmail,
      subject,
      html,
    });

    this.logger.log(`Admin notification sent for ${jobType} job ${jobId}`);
  }

  private async sendSlackNotification(
    jobType: string,
    jobId: string | undefined,
    jobData: any,
    error: Error,
    isFinal: boolean,
  ) {
    if (!this.slackWebhookUrl) return;

    const severity = isFinal ? '🚨 *FINAL FAILURE*' : '⚠️ *Job Failed*';
    const payload = {
      text: `${severity}: ${jobType}`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `${severity}\n*Queue:* ${jobType}\n*Job ID:* ${jobId || 'Unknown'}\n*Error:* ${error.message}`,
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Job Data:*\n\`\`\`${JSON.stringify(jobData, null, 2).slice(0, 500)}\`\`\``,
          },
        },
      ],
    };

    try {
      const response = await fetch(this.slackWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        this.logger.warn(`Slack notification failed: HTTP ${response.status}`);
      }
    } catch (err) {
      this.logger.warn(`Slack notification error: ${(err as Error).message}`);
    }
  }

  private async sendUserNotification(payoutId: number, error: Error) {
    try {
      const payout = await this.prisma.payout.findUnique({
        where: { id: payoutId },
        include: { user: true },
      });

      if (!payout || !payout.user.email) {
        return;
      }

      const subject = 'Payout Processing Failed';
      const html = `
        <h2>Payout Processing Issue</h2>
        <p>Dear ${payout.user.name || 'User'},</p>
        <p>We encountered an issue processing your payout request (ID: ${payoutId}).</p>
        <p><strong>Amount:</strong> ${payout.amount} ${payout.currency}</p>
        <p><strong>Status:</strong> ${payout.status}</p>
        <p>Our team has been notified and is working to resolve this issue. We will contact you shortly with an update.</p>
        <p>If you have any questions, please contact our support team.</p>
        <p>Best regards,<br>The Team</p>
      `;

      await this.mailService.sendEmail({
        to: payout.user.email,
        subject,
        html,
      });

      this.logger.log(`User notification sent for payout ${payoutId}`);
    } catch (err) {
      this.logger.error(
        `Failed to send user notification for payout ${payoutId}`,
        err,
      );
    }
  }
}
