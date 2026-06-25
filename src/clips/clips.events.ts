/** Emitted after a bulk update when every clip in a video has postStatus = 'posted' */
export const ALL_CLIPS_PROCESSED_EVENT = 'clips.allProcessed';

export interface AllClipsProcessedPayload {
  videoId: string;
  clipCount: number;
}

/**
 * Emitted when a clip-generation job exhausts all retry attempts.
 * Consumers should mark Video.status = 'failed' and notify the user.
 */
export const CLIP_GENERATION_FAILED_EVENT = 'clips.generationFailed';

export interface ClipGenerationFailedPayload {
  jobId: string | undefined;
  videoId: string;
  /** The reason string from job.failedReason (BullMQ) */
  failedReason: string;
  attemptsMade: number;
}

// ─── Real-time progress WebSocket events ─────────────────────────────────────

/**
 * Step labels emitted at key processing milestones.
 *
 *  video_download  —  source video has been fetched / is accessible (10 %)
 *  ai_analysis     —  Anthropic/fallback viral-moment detection complete (30 %)
 *  ffmpeg_cut      —  local clip file has been written by FFmpeg (60 %)
 *  upload          —  clip uploaded to Cloudinary CDN (90 %)
 *  done            —  job finished, DB record updated (100 %)
 */
export type ClipProgressStep =
  | 'video_download'
  | 'ai_analysis'
  | 'ffmpeg_cut'
  | 'upload'
  | 'done';

export interface ClipProgressPayload {
  /** BullMQ job ID */
  jobId: string | undefined;
  /** Prisma video ID */
  videoId: string;
  /** 0–100 */
  percent: number;
  /** Alias for percent */
  progress: number;
  /** Alias for step */
  stage: ClipProgressStep;
  /** Human-readable step label */
  step: ClipProgressStep;
  /** Snapshot of the clip being processed (may be absent for video-level jobs) */
  currentClip?: number | string | {
    id: string;
    startTime: number;
    endTime: number;
    positionRatio: number;
  };
}

export interface ClipCompletedPayload {
  jobId: string | undefined;
  videoId: string;
  clipId?: number;
  clipUrl?: string;
  thumbnail?: string;
  status: string;
}

export interface ClipFailedPayload {
  jobId: string | undefined;
  videoId: string;
  reason: string;
  attemptsMade: number;
}

/** Socket.IO event names emitted to the client */
export const WS_CLIP_PROGRESS = 'clip.progress';
export const WS_CLIP_COMPLETED = 'clip.completed';
export const WS_CLIP_FAILED = 'clip.failed';
