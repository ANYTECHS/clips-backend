export const EMAIL_DELIVERY_QUEUE = 'email-delivery';
export const EMAIL_DELIVERY_JOB = 'deliver-email';

/**
 * Email delivery jobs are moderate priority; they should be processed faster
 * than background analytics work but lower than urgent payouts.
 */
export const EMAIL_DELIVERY_QUEUE_PRIORITY = 5;

export type EmailTemplate = 'verification' | 'password-reset' | 'magic-link' | 'queue-alert';

export interface EmailDeliveryJobData {
  to: string;
  subject: string;
  template: EmailTemplate;
  context: {
    token: string;
  };
}

/**
 * Job options for the email-delivery queue.
 *
 * Retry strategy (transient failures: SMTP connection drops, rate limits):
 *   - 5 attempts total (1 initial + 4 automatic retries)
 *   - Exponential backoff starting at 500 ms
 *     attempt 1 → immediate
 *     attempt 2 → ~500 ms delay
 *     attempt 3 → ~1 000 ms delay
 *     attempt 4 → ~2 000 ms delay
 *     attempt 5 → ~4 000 ms delay
 *   - Shorter base delay than clip-generation — SMTP transients
 *     resolve faster than FFmpeg / Cloudinary failures.
 *   - removeOnComplete: true — completed email jobs don't need auditing here
 *   - removeOnFail: false  — keep failed jobs for post-mortem inspection
 */
export const EMAIL_JOB_OPTIONS = {
  attempts: 5,
  backoff: {
    type: 'exponential' as const,
    /** Base delay in ms — doubles on every retry */
    delay: 500,
  },
  removeOnComplete: true,
  removeOnFail: false,
  priority: EMAIL_DELIVERY_QUEUE_PRIORITY,
} as const;
