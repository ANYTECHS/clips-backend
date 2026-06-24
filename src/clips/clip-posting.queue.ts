/** BullMQ queue name for social-media posting jobs */
export const CLIP_POSTING_QUEUE = 'clip-posting';

/**
 * Posting jobs are I/O bound and lower priority than clip generation.
 */
export const CLIP_POSTING_QUEUE_PRIORITY = 10;

/**
 * Job data shape for a posting job.
 */
export interface ClipPostingJob {
  clipId: number;
  userId: number;
  mediaUrl: string;
  caption: string;
  platforms: string[];
}

/**
 * Default job options for the clip-posting queue.
 *
 * removeOnComplete: keep the last 200 completed posting jobs (higher volume).
 * removeOnFail:     never auto-delete — failed social posts need auditing.
 */
export const CLIP_POSTING_JOB_OPTIONS = {
  attempts: 5,
  backoff: {
    type: 'exponential' as const,
    delay: 2000,
  },
  priority: CLIP_POSTING_QUEUE_PRIORITY,
  removeOnComplete: { count: 200 },
  removeOnFail: false,
} as const;
