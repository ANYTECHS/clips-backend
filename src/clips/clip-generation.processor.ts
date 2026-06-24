import { Logger, OnModuleInit } from '@nestjs/common';
import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { Job, UnrecoverableError } from 'bullmq';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Clip } from './clip.entity';
import { calculateViralityScore } from './virality-score.util';
import { cutClip, getVideoMetadata } from './ffmpeg.util';
import { generateCaption } from './caption.util';
import { CloudinaryService } from './cloudinary.service';
import { CLIP_GENERATION_QUEUE, CLIP_GENERATION_WORKER_OPTIONS } from './clip-generation.queue';
import {
  CLIP_GENERATION_FAILED_EVENT,
  ClipGenerationFailedPayload,
  ClipProgressStep,
} from './clips.events';
import { ClipsGateway } from './clips.gateway';
import { ClipsService } from './clips.service';
import { MetricsService } from '../metrics/metrics.service';
import { PrismaService } from '../prisma/prisma.service';
import type { VideoService } from '../videos/video.service';
import { getBullMQWorkerConfig } from '../config/bullmq.config';
import { GracefulShutdownService } from '../common/shutdown/graceful-shutdown.service';

export interface ClipGenerationJob {
  videoId: string;
  /** Absolute path to the source video file */
  inputPath: string;
  /** Absolute path for the output clip file */
  outputPath: string;
  /** Start time in seconds — float safe (e.g. 12.5) */
  startTime: number;
  /** End time in seconds — float safe (e.g. 45.7) */
  endTime: number;
  /** Total duration of the source video in seconds (used to clamp endTime) */
  videoDuration?: number;
  /** 0.0–1.0: where in the source video this clip starts */
  positionRatio: number;
  transcript?: string;
  /** Video title — used to auto-generate the caption placeholder */
  title?: string;
  /** Existing Clip ID in Prisma — used to update URLs after successful generation */
  clipId?: number;
  /** Existing virality score to preserve during regeneration */
  existingViralityScore?: number;
}

export interface ClipProcessingResult {
  clip: Clip;
  retryCount?: number;
  error?: string;
}

// ── Progress percent constants ────────────────────────────────────────────────
const PROGRESS = {
  VIDEO_DOWNLOAD: 10,
  AI_ANALYSIS: 30,
  FFMPEG_CUT: 60,
  UPLOAD: 80,
  DONE: 100,
} as const;

/** Job timeout: 30 minutes */
const JOB_TIMEOUT_MS = 30 * 60 * 1000;

/**
 * BullMQ processor for clip-generation jobs.
 *
 * Worker concurrency is controlled by BULLMQ_CLIP_GENERATION_CONCURRENCY env var.
 * Default: 2 concurrent jobs (video processing is CPU-intensive)
 *
 * Retry configuration (set per-job in ClipsService.enqueueClip via CLIP_JOB_OPTIONS):
 *   attempts : 5   — 1 initial attempt + 4 automatic retries
 *   backoff  : exponential, starting at 2 000 ms
 *
 * Progress WebSocket events are emitted at each key step:
 *   10%  → video_download  (source accessible)
 *   30%  → ai_analysis     (viral moments detected — upload-type jobs only)
 *   60%  → ffmpeg_cut      (clip file written)
 *   80%  → upload          (Cloudinary upload started)
 *  100%  → done            (DB updated, all done)
 */
@Processor(CLIP_GENERATION_QUEUE, {
  concurrency: getBullMQWorkerConfig(new ConfigService()).clipGenerationConcurrency,
  // Lock duration must exceed the longest expected job run (30 min job timeout + buffer)
  lockDuration: CLIP_GENERATION_WORKER_OPTIONS.lockDuration,
  stalledInterval: CLIP_GENERATION_WORKER_OPTIONS.stalledInterval,
  maxStalledCount: CLIP_GENERATION_WORKER_OPTIONS.maxStalledCount,
})
export class ClipGenerationProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(ClipGenerationProcessor.name);

  constructor(
    private readonly cloudinaryService: CloudinaryService,
    private readonly eventEmitter: EventEmitter2,
    private readonly clipsGateway: ClipsGateway,
    private readonly clipsService: ClipsService,
    private readonly metricsService: MetricsService,
    private readonly prisma: PrismaService,
    private readonly shutdownService: GracefulShutdownService,
  ) {
    super();
    const config = getBullMQWorkerConfig(new ConfigService());
    this.logger.log(
      `Clip generation worker initialized with concurrency: ${config.clipGenerationConcurrency}`,
    );
  }

  onModuleInit(): void {
    // Register with the shutdown coordinator so SIGTERM drains this worker
    this.shutdownService.register(this.worker);
  }

  // ── Main entry point ───────────────────────────────────────────────────────

  /** Main job handler — called by BullMQ on each attempt */
  async process(job: Job<ClipGenerationJob | any>): Promise<Clip> {
    // Uploaded-video jobs have inputPath but no startTime/endTime
    if (job.data.inputPath && !job.data.startTime && !job.data.endTime) {
      return this.processUploadedVideo(job);
    }
    return this.processClipJob(job as Job<ClipGenerationJob>);
  }

  // ── Clip generation job ────────────────────────────────────────────────────

  /**
   * Process a standard clip-generation job:
   * 1. Set up timeout + abort controller
   * 2. Cut the clip with FFmpeg
   * 3. Upload to Cloudinary
   * 4. Return the completed Clip object
   */
  private async processClipJob(job: Job<ClipGenerationJob>): Promise<Clip> {
    const data = job.data;
    const clipId = `${data.videoId}-${data.startTime}-${data.endTime}`;
    const jobMetricId = `${CLIP_GENERATION_QUEUE}:${job.id}`;

    const { controller, timeout } = this.setupJobTimeout(data.videoId, String(job.id ?? ''));

    this.logger.log(
      `Processing clip job ${job.id} — attempt ${job.attemptsMade + 1}/${job.opts.attempts ?? 1} ` +
        `videoId=${data.videoId}`,
    );
    this.metricsService.recordJobStart(jobMetricId);

    try {
      await this.clipsService.refreshQueueDepth();

      // ── Step 1: video_download ─────────────────────────────────────────
      await job.updateProgress({ percent: PROGRESS.VIDEO_DOWNLOAD, step: 'video_download' });

      // ── Step 2: ffmpeg_cut ─────────────────────────────────────────────
      const { actualDuration, viralityScore } = await this.cutAndAnalyze(job, data, controller);

      // ── Step 3: upload ─────────────────────────────────────────────────
      await job.updateProgress({ percent: PROGRESS.UPLOAD, step: 'upload' });
      const uploadResult = await this.uploadWithAbort(data.outputPath, clipId, controller);

      if (uploadResult.error) {
        return this.buildUploadFailedClip(data, clipId, actualDuration, viralityScore, uploadResult.error);
      }

      // ── Step 4: done ───────────────────────────────────────────────────
      await this.cloudinaryService.deleteLocalFile(data.outputPath);
      await job.updateProgress({ percent: PROGRESS.DONE, step: 'done' });

      this.metricsService.incrementClipsGenerated('success');
      this.metricsService.recordJobCompletion(jobMetricId, CLIP_GENERATION_QUEUE, 'success');
      this.clearJobResources(data.videoId, String(job.id ?? ''), timeout);

      this.logger.log(`Clip processing complete: ${clipId} → ${uploadResult.secure_url}`);

      return this.buildSuccessClip(data, clipId, actualDuration, viralityScore, uploadResult);
    } catch (error) {
      this.handleJobError(error, data, clipId, jobMetricId);
      this.clearJobResources(data.videoId, String(job.id ?? ''), timeout);

      if (controller.signal.aborted) {
        const cancelled = this.clipsService._isVideoCancelled(data.videoId);
        throw new UnrecoverableError(cancelled ? 'Cancelled by user' : 'Timeout');
      }
      throw error;
    }
  }

  // ── Uploaded video processing ──────────────────────────────────────────────

  /**
   * Process an uploaded video job:
   * 1. Detect viral timestamps via VideoService
   * 2. Clean up the temporary uploaded file
   * Returns a placeholder Clip — actual clips are enqueued separately.
   */
  private async processUploadedVideo(job: Job<any>): Promise<Clip> {
    const { videoId, inputPath, userId } = job.data;
    this.logger.log(`Processing uploaded video ${videoId} (job: ${job.id})`);

    try {
      // ── Step 1: video_download ─────────────────────────────────────────
      await job.updateProgress({ percent: PROGRESS.VIDEO_DOWNLOAD, step: 'video_download' });

      // ── Step 2: ai_analysis — detect viral timestamps ──────────────────
      await job.updateProgress({ percent: PROGRESS.AI_ANALYSIS, step: 'ai_analysis' });
      const videoService = this.clipsService['videoService'] as VideoService;
      const moments = await videoService.detectViralTimestamps(Number(videoId));
      this.logger.log(`Detected ${moments.length} viral moments for video ${videoId}`);

      // ── Step 3: cleanup temp file ──────────────────────────────────────
      await this.safeDeleteLocalFile(inputPath);
      await job.updateProgress({ percent: PROGRESS.DONE, step: 'done' });

      return this.buildUploadProcessedClip(videoId, userId);
    } catch (error) {
      this.logger.error(
        `Failed to process uploaded video ${videoId}: ${error.message}`,
        error.stack,
      );
      await this.safeDeleteLocalFile(inputPath);
      throw error;
    }
  }

  // ── BullMQ worker event handlers ───────────────────────────────────────────

  /**
   * Called by BullMQ after a job has exhausted ALL retry attempts.
   * Emits CLIP_GENERATION_FAILED_EVENT and a WebSocket clip.failed event.
   * NOTE: fires only on the FINAL failure, not on intermediate retries.
   */
  @OnWorkerEvent('failed')
  onFailed(job: Job<ClipGenerationJob>, error: Error): void {
    const maxAttempts = job.opts.attempts ?? 1;
    const isFinalAttempt = job.attemptsMade >= maxAttempts;

    if (!isFinalAttempt) {
      this.logRetryWarning(job, error, maxAttempts);
      return;
    }

    // Final failure — record metrics, log, and notify the system
    this.metricsService.recordJobFailure(CLIP_GENERATION_QUEUE, 'final_failure');
    this.logger.error(
      `[FINAL FAILURE] Clip job ${job.id} exhausted all ${maxAttempts} attempts — ` +
        `videoId=${job.data.videoId} — reason: ${error.message}`,
      error.stack,
    );

    void this.clipsService.refreshQueueDepth();
    this.emitClipGenerationFailedEvent(job, error);
    void this.emitFailedWebSocketEvent(job, error);
  }

  /**
   * Called by BullMQ after a job completes successfully.
   * Updates the Clip record in Prisma and emits a clip.completed WebSocket event.
   */
  @OnWorkerEvent('completed')
  async onCompleted(job: Job<ClipGenerationJob>, result: Clip): Promise<void> {
    await this.updateClipInDatabase(job, result);
    await this.clipsService.refreshQueueDepth();

    const userId = await this.resolveUserId(job.data.videoId);
    if (userId) {
      this.clipsGateway.emitCompleted(userId, {
        jobId: job.id,
        videoId: job.data.videoId,
        clipId: job.data.clipId,
        clipUrl: result.clipUrl,
        thumbnail: result.thumbnail,
        status: result.status ?? 'success',
      });
    }
  }

  /**
   * Called by BullMQ on every job.updateProgress() call.
   * Resolves the userId and emits a typed progress event over WebSocket.
   */
  @OnWorkerEvent('progress')
  onProgress(job: Job<ClipGenerationJob>, progress: number | object): void {
    const { percent, step } = this.parseProgress(progress);
    const clipId = `${job.data.videoId}-${job.data.startTime}-${job.data.endTime}`;

    const video = this.clipsService._getVideo(job.data.videoId);
    if (video?.userId) {
      this.emitProgressEvent(String(video.userId), job, percent, step, clipId);
    } else {
      void this.resolveUserId(job.data.videoId).then((userId) => {
        if (userId) this.emitProgressEvent(userId, job, percent, step, clipId);
      });
    }
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  /**
   * Set up a job-level AbortController and timeout.
   * Registers the controller with ClipsService so it can be cancelled externally.
   */
  private setupJobTimeout(
    videoId: string,
    jobId: string,
  ): { controller: AbortController; timeout: NodeJS.Timeout } {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), JOB_TIMEOUT_MS);
    this.clipsService._registerJobController(videoId, jobId, controller);
    return { controller, timeout };
  }

  /** Clear the timeout and deregister the job controller. */
  private clearJobResources(videoId: string, jobId: string, timeout: NodeJS.Timeout): void {
    clearTimeout(timeout);
    this.clipsService._clearJobController(jobId);
  }

  /**
   * Run FFmpeg to cut the clip, then compute virality score.
   * Returns the actual clip duration and virality score.
   */
  private async cutAndAnalyze(
    job: Job<ClipGenerationJob>,
    data: ClipGenerationJob,
    controller: AbortController,
  ): Promise<{ actualDuration: number; viralityScore: number }> {
    await cutClip({
      inputPath: data.inputPath,
      outputPath: data.outputPath,
      startTime: data.startTime,
      endTime: data.endTime,
      videoDuration: data.videoDuration,
      signal: controller.signal,
    });
    await job.updateProgress({ percent: PROGRESS.FFMPEG_CUT, step: 'ffmpeg_cut' });

    const metadata = await getVideoMetadata(data.outputPath);
    const actualDuration = Math.round(metadata.duration);

    const viralityScore =
      data.existingViralityScore ??
      calculateViralityScore({
        durationSeconds: actualDuration,
        positionRatio: data.positionRatio,
        transcript: data.transcript,
      });

    this.logger.log(
      `Clip cut — videoId=${data.videoId} duration=${data.endTime - data.startTime}s ` +
        `position=${(data.positionRatio * 100).toFixed(0)}% viralityScore=${viralityScore}`,
    );

    return { actualDuration, viralityScore };
  }

  /**
   * Upload the clip to Cloudinary, racing against the abort signal.
   * Returns the upload result (may contain an error field on failure).
   */
  private async uploadWithAbort(
    filePath: string,
    clipId: string,
    controller: AbortController,
  ): Promise<any> {
    const abortPromise = new Promise<never>((_, reject) => {
      controller.signal.addEventListener('abort', () => reject(new Error('Aborted')), { once: true });
    });
    return Promise.race([this.uploadToCloudinary(filePath, clipId), abortPromise]);
  }

  /**
   * Upload clip buffer to Cloudinary with 2 retries (3 total attempts).
   * Returns an object with `error` set on failure instead of throwing.
   */
  private async uploadToCloudinary(filePath: string, clipId: string): Promise<any> {
    try {
      const buffer = await this.cloudinaryService.readFileToBuffer(filePath);
      return await this.cloudinaryService.uploadVideoFromBuffer(buffer, clipId, {}, 2);
    } catch (error) {
      this.logger.error(`Upload to Cloudinary failed for ${clipId}: ${error.message}`);
      return { error: error.message, secure_url: '', public_id: clipId };
    }
  }

  /**
   * Handle errors from the main clip processing try/catch.
   * Records metrics and attempts cleanup of the local file for non-upload errors.
   */
  private handleJobError(
    error: Error,
    data: ClipGenerationJob,
    clipId: string,
    jobMetricId: string,
  ): void {
    this.metricsService.incrementClipsGenerated('failure');
    this.metricsService.recordJobCompletion(jobMetricId, CLIP_GENERATION_QUEUE, 'failure');
    this.metricsService.recordJobFailure(CLIP_GENERATION_QUEUE, error.message);
    this.logger.error(`Clip generation failed for ${clipId}: ${error.message}`, error.stack);

    // Only clean up local file for non-upload errors (upload errors preserve the file as fallback)
    const isUploadError = error.message?.includes('Cloudinary') || error.message?.includes('upload');
    if (!isUploadError) {
      void this.safeDeleteLocalFile(data.outputPath);
    }
  }

  /** Delete a local file, logging a warning on failure instead of throwing. */
  private async safeDeleteLocalFile(filePath: string): Promise<void> {
    try {
      await this.cloudinaryService.deleteLocalFile(filePath);
    } catch (err) {
      this.logger.warn(`Cleanup failed for ${filePath}: ${err.message}`);
    }
  }

  /** Update the Clip record in Prisma after a successful job. */
  private async updateClipInDatabase(job: Job<ClipGenerationJob>, result: Clip): Promise<void> {
    const { clipId } = job.data;
    if (!clipId) {
      this.logger.debug(`Job ${job.id} completed but no clipId provided for database update`);
      return;
    }
    this.logger.log(`Job ${job.id} completed. Updating clip ${clipId} in database.`);
    try {
      await this.clipsService.updateClip(clipId, {
        clipUrl: result.clipUrl,
        thumbnail: result.thumbnail,
        status: result.status,
        duration: result.duration,
        error: result.error,
        localFilePath: result.localFilePath,
      });
    } catch (error) {
      this.logger.error(`Failed to update clip ${clipId} after successful generation: ${error.message}`);
    }
  }

  /** Emit the CLIP_GENERATION_FAILED_EVENT for downstream listeners. */
  private emitClipGenerationFailedEvent(job: Job<ClipGenerationJob>, error: Error): void {
    const payload: ClipGenerationFailedPayload = {
      jobId: job.id,
      videoId: job.data.videoId,
      failedReason: job.failedReason ?? error.message,
      attemptsMade: job.attemptsMade,
    };
    this.eventEmitter.emit(CLIP_GENERATION_FAILED_EVENT, payload);
  }

  /** Emit a clip.failed WebSocket event to the affected user (fire-and-forget). */
  private async emitFailedWebSocketEvent(job: Job<ClipGenerationJob>, error: Error): Promise<void> {
    const userId = await this.resolveUserId(job.data.videoId);
    if (!userId) return;
    this.clipsGateway.emitFailed(userId, {
      jobId: job.id,
      videoId: job.data.videoId,
      reason: job.failedReason ?? error.message,
      attemptsMade: job.attemptsMade,
    });
  }

  /** Log a warning for intermediate (non-final) job failures. */
  private logRetryWarning(job: Job<ClipGenerationJob>, error: Error, maxAttempts: number): void {
    const backoffDelay = job.opts.backoff
      ? typeof job.opts.backoff === 'number'
        ? job.opts.backoff
        : (job.opts.backoff.delay ?? 2000) * Math.pow(2, job.attemptsMade - 1)
      : 0;

    this.logger.warn(
      `[RETRY] Clip job ${job.id} failed on attempt ${job.attemptsMade}/${maxAttempts} — ` +
        `videoId=${job.data.videoId} — reason: ${error.message} — ` +
        `retrying in ~${Math.round(backoffDelay / 1000)}s`,
    );
  }

  /** Emit a progress WebSocket event to the user. */
  private emitProgressEvent(
    userId: string,
    job: Job<ClipGenerationJob>,
    percent: number,
    step: ClipProgressStep,
    clipId: string,
  ): void {
    const isUploadJob = !job.data.startTime && !job.data.endTime;
    this.clipsGateway.emitProgress(userId, {
      jobId: job.id,
      videoId: job.data.videoId,
      percent,
      step,
      ...(!isUploadJob && {
        currentClip: {
          id: clipId,
          startTime: job.data.startTime,
          endTime: job.data.endTime,
          positionRatio: job.data.positionRatio,
        },
      }),
    });
  }

  /** Parse a raw BullMQ progress value into { percent, step }. */
  private parseProgress(progress: number | object): { percent: number; step: ClipProgressStep } {
    const rawPercent =
      typeof progress === 'object' && progress !== null
        ? (progress as any).percent
        : progress;
    const step: ClipProgressStep =
      typeof progress === 'object' && progress !== null
        ? ((progress as any).step ?? 'ffmpeg_cut')
        : this.stepFromPercent(Number(rawPercent));
    const percent = Math.max(0, Math.min(100, Math.round(Number(rawPercent) || 0)));
    return { percent, step };
  }

  /**
   * Resolve the userId for a given videoId.
   * Checks the in-memory store first (fast path), then falls back to Prisma.
   */
  private async resolveUserId(videoId: string): Promise<string | null> {
    const video = this.clipsService._getVideo(videoId);
    if (video?.userId) return String(video.userId);

    try {
      const dbVideo = await this.prisma.video.findUnique({
        where: { id: Number(videoId) },
        select: { userId: true },
      });
      return dbVideo?.userId ? String(dbVideo.userId) : null;
    } catch {
      return null;
    }
  }

  /** Infer a step label from a legacy bare-number progress value. */
  private stepFromPercent(percent: number): ClipProgressStep {
    if (percent <= 10) return 'video_download';
    if (percent <= 30) return 'ai_analysis';
    if (percent <= 60) return 'ffmpeg_cut';
    if (percent <= 90) return 'upload';
    return 'done';
  }

  // ── Clip builder helpers ───────────────────────────────────────────────────

  /** Build a Clip object for a successful generation. */
  private buildSuccessClip(
    data: ClipGenerationJob,
    clipId: string,
    actualDuration: number,
    viralityScore: number,
    uploadResult: any,
  ): Clip {
    return {
      id: clipId,
      videoId: data.videoId,
      userId: '',
      startTime: data.startTime,
      endTime: data.endTime,
      duration: actualDuration,
      positionRatio: data.positionRatio,
      transcript: data.transcript,
      viralityScore,
      clipUrl: uploadResult.secure_url,
      thumbnail: uploadResult.thumbnail_url,
      status: 'success',
      selected: false,
      postStatus: null,
      caption: generateCaption(data.title, clipId, data.transcript),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  /** Build a Clip object when Cloudinary upload failed (keeps local file as fallback). */
  private buildUploadFailedClip(
    data: ClipGenerationJob,
    clipId: string,
    actualDuration: number,
    viralityScore: number,
    errorMessage: string,
  ): Clip {
    this.metricsService.incrementClipsGenerated('failure');
    this.logger.error(
      `Cloudinary upload failed after retries for ${clipId}: ${errorMessage}. ` +
        `Keeping local file as fallback: ${data.outputPath}`,
    );
    return {
      id: clipId,
      videoId: data.videoId,
      userId: '',
      startTime: data.startTime,
      endTime: data.endTime,
      duration: actualDuration,
      positionRatio: data.positionRatio,
      transcript: data.transcript,
      viralityScore,
      clipUrl: '',
      thumbnail: undefined,
      status: 'upload_failed',
      localFilePath: data.outputPath,
      error: `Cloudinary upload failed: ${errorMessage}`,
      selected: false,
      postStatus: null,
      caption: generateCaption(data.title, clipId, data.transcript),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  /** Build a placeholder Clip for a completed uploaded-video processing job. */
  private buildUploadProcessedClip(videoId: string, userId: string): Clip {
    return {
      id: `upload-${videoId}`,
      videoId: String(videoId),
      userId: String(userId || ''),
      startTime: 0,
      endTime: 0,
      duration: 0,
      positionRatio: 0,
      clipUrl: '',
      status: 'upload_processed' as const,
      selected: false,
      postStatus: null,
      caption: '',
      viralityScore: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }
}
