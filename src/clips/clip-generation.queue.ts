/**
 * Clip-generation queue — FFmpeg processing and Cloudinary upload.
 * Highest priority: users are actively waiting for their clips.
 */
export const CLIP_GENERATION_QUEUE = 'clip-generation';
export const CLIP_GENERATION_JOB = 'generate-clip';
export const CLIP_GENERATION_QUEUE_PRIORITY = 1;

export interface ClipGenerationJobData {
  videoId: number;
  userId: number;
  sourceUrl: string;
  startTime: number;
  endTime: number;
  clipId?: number;
}
