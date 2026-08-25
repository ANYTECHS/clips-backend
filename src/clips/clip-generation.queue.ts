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
  backoff: { type: 'exponential' as const, delay: 5000 },
  removeOnComplete: false,
  removeOnFail: false,
  priority: CLIP_GENERATION_QUEUE_PRIORITY,
} as const;
