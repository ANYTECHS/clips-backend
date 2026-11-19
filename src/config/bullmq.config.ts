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
  /** NFT mint queue concurrency */
  nftMintConcurrency: number;
  /** Clip posting queue concurrency (I/O-bound API calls) */
  clipPostingConcurrency: number;
  /** Anomaly detection queue concurrency */
  anomalyDetectionConcurrency: number;
  /** Payout retry queue concurrency */
  payoutRetryConcurrency: number;
}

export interface BullMQConnectionConfig {
  /** Redis host for BullMQ connection */
  redisHost: string;
  /** Redis port for BullMQ connection */
  redisPort: number;
}

/**
 * Load BullMQ Redis connection config from environment variables.
 */
export function getBullMQConnectionConfig(
  configService: ConfigService,
): BullMQConnectionConfig {
  return {
    redisHost: configService.get<string>('REDIS_HOST', 'localhost'),
    redisPort: parseInt(configService.get<string>('REDIS_PORT', '6379'), 10),
  };
}

/**
 * Validate Redis connection configuration.
 * Ensures REDIS_HOST is a non-empty string and REDIS_PORT is a valid port number.
 */
export function validateConnectionConfig(config: BullMQConnectionConfig): void {
  const errors: string[] = [];

  if (!config.redisHost || config.redisHost.trim() === '') {
    errors.push('REDIS_HOST must be a non-empty string');
  }

  if (isNaN(config.redisPort) || config.redisPort < 1 || config.redisPort > 65535) {
    errors.push('REDIS_PORT must be a valid port number between 1 and 65535');
  }

  if (errors.length > 0) {
    throw new Error(`Invalid BullMQ connection configuration:\n${errors.join('\n')}`);
  }
}

/**
 * Per-queue rate limit and overflow configuration.
 *
 * Rate limiting prevents a single queue from being flooded during traffic spikes:
 *   - maxJobsPerUser / windowSecs  — per-user enqueue cap (Redis sliding window)
 *   - globalDepthCap               — total waiting+active jobs allowed before overflow kicks in
 *   - overflowDelayMs              — delay added to jobs when the queue is over capacity
 *                                    (0 = reject immediately with 429 instead of delaying)
 */
export interface QueueRateLimitConfig {
  /** Max jobs a single user may enqueue within windowSecs. Env-configurable. */
  maxJobsPerUser: number;
  /** Sliding window duration in seconds for the per-user cap. */
  windowSecs: number;
  /**
   * Maximum total jobs (waiting + active + delayed) allowed in the queue
   * before new jobs are delayed instead of enqueued immediately.
   * 0 disables the global depth cap.
   */
  globalDepthCap: number;
  /**
   * How long to delay a job (ms) when the queue is over its globalDepthCap.
   * Set to 0 to reject excess jobs with HTTP 429 instead of delaying them.
   */
  overflowDelayMs: number;
}

export interface BullMQFullConfig {
  worker: BullMQWorkerConfig;
  rateLimits: {
    clipGeneration: QueueRateLimitConfig;
    emailDelivery: QueueRateLimitConfig;
    nftMint: QueueRateLimitConfig;
    clipPosting: QueueRateLimitConfig;
  };
}

/**
 * Load BullMQ worker configuration from environment variables
 * with sensible defaults for each queue type.
 */
export function getBullMQWorkerConfig(
  configService: ConfigService,
): BullMQWorkerConfig {
  const globalConcurrency = configService.get<number>('WORKER_CONCURRENCY');
  
  if (globalConcurrency !== undefined && !isNaN(globalConcurrency) && globalConcurrency > 0) {
    return {
      clipGenerationConcurrency: globalConcurrency,
      emailDeliveryConcurrency: globalConcurrency,
      nftMintConcurrency: globalConcurrency,
      clipPostingConcurrency: globalConcurrency,
      anomalyDetectionConcurrency: globalConcurrency,
      payoutRetryConcurrency: globalConcurrency,
    };
  }

  return {
    // Clip generation: CPU-intensive, default to 2 concurrent jobs
    clipGenerationConcurrency: parseInt(
      configService.get<string>('BULLMQ_CLIP_GENERATION_CONCURRENCY', '2'),
      10,
    ),
    // Email delivery: I/O-bound, default to 5 concurrent jobs
    emailDeliveryConcurrency: parseInt(
      configService.get<string>('BULLMQ_EMAIL_DELIVERY_CONCURRENCY', '5'),
      10,
    ),
    // NFT mint: default to 1 concurrent job
    nftMintConcurrency: parseInt(
      configService.get<string>('BULLMQ_NFT_MINT_CONCURRENCY', '1'),
      10,
    ),
    // Clip posting: I/O-bound, default to 10 concurrent jobs
    clipPostingConcurrency: parseInt(
      configService.get<string>('BULLMQ_CLIP_POSTING_CONCURRENCY', '10'),
      10,
    ),
    // Anomaly detection: default to 1 concurrent job
    anomalyDetectionConcurrency: parseInt(
      configService.get<string>('BULLMQ_ANOMALY_DETECTION_CONCURRENCY', '1'),
      10,
    ),
    // Payout retry: default to 1 concurrent job
    payoutRetryConcurrency: parseInt(
      configService.get<string>('BULLMQ_PAYOUT_RETRY_CONCURRENCY', '1'),
      10,
    ),
  };
}

/**
 * Load per-queue rate limit and overflow configuration from environment variables.
 *
 * All values are configurable without code changes:
 *
 *   BULLMQ_{QUEUE}_MAX_JOBS_PER_USER    — per-user enqueue cap
 *   BULLMQ_{QUEUE}_RATE_WINDOW_SECS     — sliding window for the user cap
 *   BULLMQ_{QUEUE}_GLOBAL_DEPTH_CAP     — total queue depth before overflow
 *   BULLMQ_{QUEUE}_OVERFLOW_DELAY_MS    — delay added to overflowed jobs (0 = reject)
 *
 * where {QUEUE} is one of: CLIP_GENERATION, EMAIL_DELIVERY, NFT_MINT, CLIP_POSTING.
 */
export function getBullMQRateLimitConfig(
  configService: ConfigService,
): BullMQFullConfig['rateLimits'] {
  const load = (prefix: string, defaults: QueueRateLimitConfig): QueueRateLimitConfig => ({
    maxJobsPerUser: parseInt(
      configService.get<string>(`BULLMQ_${prefix}_MAX_JOBS_PER_USER`, String(defaults.maxJobsPerUser)),
      10,
    ),
    windowSecs: parseInt(
      configService.get<string>(`BULLMQ_${prefix}_RATE_WINDOW_SECS`, String(defaults.windowSecs)),
      10,
    ),
    globalDepthCap: parseInt(
      configService.get<string>(`BULLMQ_${prefix}_GLOBAL_DEPTH_CAP`, String(defaults.globalDepthCap)),
      10,
    ),
    overflowDelayMs: parseInt(
      configService.get<string>(`BULLMQ_${prefix}_OVERFLOW_DELAY_MS`, String(defaults.overflowDelayMs)),
      10,
    ),
  });

  return {
    clipGeneration: load('CLIP_GENERATION', {
      maxJobsPerUser: 5,
      windowSecs: 3600,      // 1 hour
      globalDepthCap: 200,   // >200 waiting/active → overflow
      overflowDelayMs: 30000, // delay new jobs by 30 s when over capacity
    }),
    emailDelivery: load('EMAIL_DELIVERY', {
      maxJobsPerUser: 10,
      windowSecs: 3600,
      globalDepthCap: 500,
      overflowDelayMs: 10000, // emails are lightweight — shorter delay
    }),
    nftMint: load('NFT_MINT', {
      maxJobsPerUser: 3,
      windowSecs: 3600,
      globalDepthCap: 100,
      overflowDelayMs: 60000, // blockchain txs take time — longer delay
    }),
    clipPosting: load('CLIP_POSTING', {
      maxJobsPerUser: 10,
      windowSecs: 3600,
      globalDepthCap: 300,
      overflowDelayMs: 15000,
    }),
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

  if (config.nftMintConcurrency < 1) {
    errors.push('BULLMQ_NFT_MINT_CONCURRENCY must be at least 1');
  }
  if (config.nftMintConcurrency > 200) {
    errors.push('BULLMQ_NFT_MINT_CONCURRENCY should not exceed 200 (risk of resource exhaustion)');
  }

  if (config.clipPostingConcurrency < 1) {
    errors.push('BULLMQ_CLIP_POSTING_CONCURRENCY must be at least 1');
  }
  if (config.clipPostingConcurrency > 100) {
    errors.push('BULLMQ_CLIP_POSTING_CONCURRENCY should not exceed 100 (risk of API rate limits)');
  }

  if (config.anomalyDetectionConcurrency < 1) {
    errors.push('BULLMQ_ANOMALY_DETECTION_CONCURRENCY must be at least 1');
  }
  if (config.anomalyDetectionConcurrency > 50) {
    errors.push('BULLMQ_ANOMALY_DETECTION_CONCURRENCY should not exceed 50');
  }

  if (config.payoutRetryConcurrency < 1) {
    errors.push('BULLMQ_PAYOUT_RETRY_CONCURRENCY must be at least 1');
  }
  if (config.payoutRetryConcurrency > 50) {
    errors.push('BULLMQ_PAYOUT_RETRY_CONCURRENCY should not exceed 50');
  }

  if (errors.length > 0) {
    throw new Error(
      `Invalid BullMQ worker configuration:\n${errors.join('\n')}`,
    );
  }
}

/**
 * Validate rate limit configuration values.
 * Catches obviously wrong values (negatives, unreasonably large windows, etc.)
 */
export function validateRateLimitConfig(
  config: BullMQFullConfig['rateLimits'],
): void {
  const errors: string[] = [];

  for (const [name, cfg] of Object.entries(config)) {
    if (cfg.maxJobsPerUser < 1) {
      errors.push(`${name}: maxJobsPerUser must be at least 1`);
    }
    if (cfg.windowSecs < 1) {
      errors.push(`${name}: windowSecs must be at least 1`);
    }
    if (cfg.globalDepthCap < 0) {
      errors.push(`${name}: globalDepthCap cannot be negative`);
    }
    if (cfg.overflowDelayMs < 0) {
      errors.push(`${name}: overflowDelayMs cannot be negative`);
    }
    if (cfg.overflowDelayMs > 24 * 60 * 60 * 1000) {
      errors.push(`${name}: overflowDelayMs cannot exceed 24 hours`);
    }
  }

  if (errors.length > 0) {
    throw new Error(
      `Invalid BullMQ rate limit configuration:\n${errors.join('\n')}`,
    );
  }
}
