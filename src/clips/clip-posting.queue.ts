/**
 * Clip-posting queue — posting clips to social platforms via Ayrshare.
 * Medium priority: important but not as urgent as generation.
 */
export const CLIP_POSTING_QUEUE = 'clip-posting';
export const CLIP_POSTING_JOB = 'post-clip';
export const CLIP_POSTING_QUEUE_PRIORITY = 3;

export interface ClipPostingJobData {
  clipId: number;
  userId: number;
  platforms: string[];
  caption?: string;
}
