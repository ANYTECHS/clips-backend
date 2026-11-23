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

export interface ClipPostingJob {
  clipId: number;
  userId: number;
  mediaUrl: string;
  caption: string;
  platforms: string[];
  hashtags?: string[];
  scheduledAt?: string;
}

export type ClipPostingJobData = ClipPostingJob;

export const CLIP_POSTING_JOB_OPTIONS = {
  attempts: 5,
  backoff: {
    type: 'exponential' as const,
    delay: 5000,
  },
  removeOnComplete: false,
  removeOnFail: false,
  priority: CLIP_POSTING_QUEUE_PRIORITY,
} as const;
