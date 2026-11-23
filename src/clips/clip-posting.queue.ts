/**
 * BullMQ queue name and priority constants for the clip-posting queue.
 * Jobs on this queue post clips to social media platforms via Ayrshare.
 */
export const CLIP_POSTING_QUEUE = 'clip-posting';
export const CLIP_POSTING_JOB = 'post-clip';

/**
 * Clip-posting jobs are medium priority — slightly below clip-generation
 * because generation must complete before posting is possible.
 */
export const CLIP_POSTING_QUEUE_PRIORITY = 3;

/**
 * Data carried by every clip-posting job.
 * `mediaUrl` is the Cloudinary URL of the clip to publish.
 */
export interface ClipPostingJob {
  clipId: number;
  userId: number;
  mediaUrl: string;
  platforms: string[];
  caption?: string;
  hashtags?: string[];
  scheduledAt?: string;
}

/**
 * Retry policy for posting jobs, applied per-job by ClipPublishService.
 *  - 5 attempts with exponential backoff starting at 2 000 ms absorbs the
 *    transient rate-limit windows that social platforms enforce.
 *  - Jobs are never auto-removed so failures remain inspectable in the
 *    dead-letter / queue dashboard.
 */
export const CLIP_POSTING_JOB_OPTIONS = {
  attempts: 5,
  backoff: {
    type: 'exponential' as const,
    delay: 2000,
  },
  removeOnComplete: false,
  removeOnFail: false,
  priority: CLIP_POSTING_QUEUE_PRIORITY,
} as const;
