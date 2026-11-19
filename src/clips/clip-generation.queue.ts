/**
 * BullMQ queue name and priority constants for the clip-generation queue.
 * Jobs on this queue run FFmpeg to cut video segments and upload to Cloudinary.
 */
export const CLIP_GENERATION_QUEUE = 'clip-generation';
export const CLIP_GENERATION_JOB = 'generate-clip';

/**
 * Clip-generation jobs are high priority — users are waiting for their
 * content to appear and the queue should drain quickly.
 */
export const CLIP_GENERATION_QUEUE_PRIORITY = 2;

export interface ClipGenerationJobData {
  videoId: string;
  inputPath: string;
  userId: number;
  originalName: string;
  metadata?: {
    duration: number;
    width: number;
    height: number;
    format: string;
    fps: number;
    bitrate: number;
  };
}

export const CLIP_GENERATION_JOB_OPTIONS = {
  attempts: 3,
  backoff: {
    type: 'exponential' as const,
    delay: 5000,
  },
  removeOnComplete: false,
  removeOnFail: false,
  priority: CLIP_GENERATION_QUEUE_PRIORITY,
} as const;

/**
 * BullMQ worker options for the clip-generation processor (Issue #1235).
 * Lock duration must exceed the longest expected job run (30 min timeout + buffer).
 */
export const CLIP_GENERATION_WORKER_OPTIONS = {
  lockDuration: 32 * 60 * 1000,
  stalledInterval: 30 * 1000,
  maxStalledCount: 3,
} as const;

/** Backwards-compatible alias for older processor specs. */
export const CLIP_JOB_OPTIONS = CLIP_GENERATION_JOB_OPTIONS;
