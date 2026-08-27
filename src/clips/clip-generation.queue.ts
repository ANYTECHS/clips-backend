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
export const CLIP_GENERATION_QUEUE = 'clip-generation';
export const CLIP_GENERATION_JOB = 'generate-clip';
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
  backoff: { type: 'exponential' as const, delay: 5000 },
  removeOnComplete: false,
  removeOnFail: false,
  priority: CLIP_GENERATION_QUEUE_PRIORITY,
} as const;
export interface ClipGenerationJobData { videoId: string; inputPath: string; userId: number; originalName: string; metadata?: { duration: number; width: number; height: number; format: string; fps: number; bitrate: number } }
export const CLIP_GENERATION_JOB_OPTIONS = { attempts: 3, backoff: { type: 'exponential' as const, delay: 5000 }, removeOnComplete: false, removeOnFail: false, priority: CLIP_GENERATION_QUEUE_PRIORITY } as const;
/**
 * Clip Generation queue name and priority constant.
 * Used by BullMQ queue registration across the application.
 */
export const CLIP_GENERATION_QUEUE = 'clip-generation';
export const CLIP_GENERATION_QUEUE_PRIORITY = 5;
