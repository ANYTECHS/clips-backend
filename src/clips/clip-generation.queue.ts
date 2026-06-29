/** BullMQ queue name for clip-generation jobs */
export const CLIP_GENERATION_QUEUE = 'clip-generation';

/**
 * Clip generation jobs are CPU and memory intensive, so they are scheduled
 * at normal priority relative to lightweight background work.
 */
export const CLIP_GENERATION_QUEUE_PRIORITY = 5;

/**
 * Worker options for the clip-generation queue.
 *
 * lockDuration:    How long (ms) BullMQ holds the job lock before it must be
 *                  renewed. Must be longer than the longest expected job run.
 *                  Clip jobs can take up to 30 min — set to 35 min with a
 *                  comfortable buffer.
 *
 * stalledInterval: How often (ms) the stall-checker runs to find jobs whose
 *                  lock has not been renewed (worker crashed mid-job).
 *                  Set to 60 s so stalled jobs are recovered within a minute
 *                  after an unexpected process death.
 *
 * maxStalledCount: How many times a job may be stall-recovered before it is
 *                  moved to `failed` permanently.  Prevents infinite recovery
 *                  loops on poison-pill jobs.
 */
export const CLIP_GENERATION_WORKER_OPTIONS = {
  lockDuration: 35 * 60 * 1000,   // 35 minutes
  stalledInterval: 60 * 1000,     // check every 60 s
  maxStalledCount: 2,
} as const;

/**
 * Default job options applied to every clip-generation job.
 *
 * Retry strategy (transient failures: network, FFmpeg OOM, Cloudinary rate-limits):
 *   - 5 attempts total (1 initial + 4 automatic retries)
 *   - Exponential backoff starting at 2 000 ms
 *     attempt 1 → immediate
 *     attempt 2 → ~2 000 ms delay
 *     attempt 3 → ~4 000 ms delay
 *     attempt 4 → ~8 000 ms delay
 *     attempt 5 → ~16 000 ms delay
 *
 * removeOnComplete: keep the last 100 completed jobs for debugging;
 *                   older ones are pruned automatically.
 * removeOnFail:     never auto-delete failed jobs — keep them for
 *                   post-mortem inspection and manual retry.
 */
export const CLIP_JOB_OPTIONS = {
  attempts: 5,
  backoff: {
    type: 'exponential' as const,
    /** Base delay in ms — doubles on every retry */
    delay: 2000,
  },
  priority: CLIP_GENERATION_QUEUE_PRIORITY,
  removeOnComplete: { count: 100 },
  removeOnFail: false,
} as const;
