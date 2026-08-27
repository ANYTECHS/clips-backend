export const CLIP_POSTING_QUEUE = 'clip-posting';
export const CLIP_POSTING_JOB = 'post-clip';
export const CLIP_POSTING_QUEUE_PRIORITY = 3;
export interface ClipPostingJobData { clipId: number; platforms: string[]; userId: number; caption?: string; hashtags?: string[]; scheduledAt?: string }
export const CLIP_POSTING_JOB_OPTIONS = { attempts: 3, backoff: { type: 'exponential' as const, delay: 5000 }, removeOnComplete: false, removeOnFail: false, priority: CLIP_POSTING_QUEUE_PRIORITY } as const;
/**
 * Clip Posting queue name and priority constant.
 * Used by BullMQ queue registration across the application.
 */
export const CLIP_POSTING_QUEUE = 'clip-posting';
export const CLIP_POSTING_QUEUE_PRIORITY = 4;
