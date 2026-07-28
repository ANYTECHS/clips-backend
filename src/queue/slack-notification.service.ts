import { Injectable, Logger } from '@nestjs/common';
import * as https from 'https';
import { URL } from 'url';

/**
 * Service that sends a simple text payload to a Slack Incoming Webhook URL.
 *
 * The webhook URL must be provided via the `SLACK_WEBHOOK_URL` environment
 * variable. If it is not set the service will log a warning and silently skip
 * sending the notification – this prevents runtime crashes in environments where
 * Slack integration is optional.
 */
@Injectable()
export class SlackNotificationService {
  private readonly logger = new Logger(SlackNotificationService.name);
  private readonly webhookUrl = process.env.SLACK_WEBHOOK_URL;

  /**
   * Sends a message to Slack.
   * @param message The plain‑text message that will appear in the Slack channel.
   */
  async notify(message: string): Promise<void> {
    if (!this.webhookUrl) {
      this.logger.warn('SLACK_WEBHOOK_URL not set – Slack notification skipped');
      return;
    }

    const payload = JSON.stringify({ text: message });
    const url = new URL(this.webhookUrl);

    const options: https.RequestOptions = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    };

    await new Promise<void>((resolve, reject) => {
      const req = https.request(options, (res) => {
        // Consume response data to free memory – we don't need the body.
        res.on('data', () => {});
        res.on('end', () => resolve());
      });

      req.on('error', (err) => {
        this.logger.error('Failed to send Slack notification', err);
        reject(err);
      });

      req.write(payload);
      req.end();
    });
  }
}
