import { ConfigService } from '@nestjs/config';

/**
 * BullMQ Worker Configuration
 *
 * Defines concurrency settings for each queue processor.
 * Concurrency controls how many jobs a worker processes simultaneously.
 *
 * Guidelines:
 * - CPU-intensive tasks (video processing): Lower concurrency (1-5)
 * - I/O-bound tasks (emails, API calls): Higher concurrency (5-20)
 * - Memory-intensive tasks: Lower concurrency to prevent OOM
 *
 * Environment-specific recommendations:
 * - Development: 1-2 (easier debugging, lower resource usage)
 * - Staging: 2-4 (balance between testing and resources)
 * - Production: 5-10+ (maximize throughput, scale based on server capacity)
 */
export interface BullMQWorkerConfig {
  /** Clip generation queue concurrency (CPU-intensive video processing) */
  clipGenerationConcurrency: number;
  /** Email delivery queue concurrency (I/O-bound SMTP operations) */
  emailDeliveryConcurrency: number;
}

/**
 * Load BullMQ worker configuration from environment variables
 * with sensible defaults for each queue type.
 */
function readConcurrency(
  configService: ConfigService | undefined,
  key: string,
  defaultValue: string,
): number {
  const fromConfig = configService?.get<string>(key);
  const raw = fromConfig ?? process.env[key] ?? defaultValue;
  return parseInt(raw, 10);
}

export function getBullMQWorkerConfig(
  configService?: ConfigService,
): BullMQWorkerConfig {
  return {
    // Clip generation: CPU-intensive, default to 2 concurrent jobs
    clipGenerationConcurrency: readConcurrency(
      configService,
      'BULLMQ_CLIP_GENERATION_CONCURRENCY',
      '2',
    ),
    // Email delivery: I/O-bound, default to 5 concurrent jobs
    emailDeliveryConcurrency: readConcurrency(
      configService,
      'BULLMQ_EMAIL_DELIVERY_CONCURRENCY',
      '5',
    ),
  };
}

/**
 * Validate worker configuration values
 * Ensures concurrency is within reasonable bounds
 */
export function validateWorkerConfig(config: BullMQWorkerConfig): void {
  const errors: string[] = [];

  if (config.clipGenerationConcurrency < 1) {
    errors.push(
      'BULLMQ_CLIP_GENERATION_CONCURRENCY must be at least 1',
    );
  }
  if (config.clipGenerationConcurrency > 200) {
    errors.push(
      'BULLMQ_CLIP_GENERATION_CONCURRENCY should not exceed 200 (risk of resource exhaustion)',
    );
  }

  if (config.emailDeliveryConcurrency < 1) {
    errors.push(
      'BULLMQ_EMAIL_DELIVERY_CONCURRENCY must be at least 1',
    );
  }
  if (config.emailDeliveryConcurrency > 50) {
    errors.push(
      'BULLMQ_EMAIL_DELIVERY_CONCURRENCY should not exceed 50 (risk of SMTP rate limits)',
    );
  }

  if (errors.length > 0) {
    throw new Error(
      `Invalid BullMQ worker configuration:\n${errors.join('\n')}`,
    );
  }
}
