import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger, Optional } from '@nestjs/common';
import { Job } from 'bullmq';
import { CLIP_GENERATION_QUEUE } from '../clips/clip-generation.queue';
import { VideoProgressGateway } from './video-progress.gateway';
import { PrismaService } from '../prisma/prisma.service';

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

/**
 * BullMQ processor for the clip-generation queue.
 *
 * Reports progress at key milestones so the VideoProgressGateway can push
 * real-time updates to connected WebSocket clients.
 *
 * Progress reporting milestones:
 *  10% — job picked up, validating input
 *  30% — AI viral-moment detection complete
 *  50% — first batch of clips cut and uploaded
 *  80% — all clips cut and uploaded
 * 100% — DB records written, job done
 *
 * Closes #738
 */
@Processor(CLIP_GENERATION_QUEUE)
export class ClipGenerationProcessor extends WorkerHost {
  private readonly logger = new Logger(ClipGenerationProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly progressGateway?: VideoProgressGateway,
  ) {
    super();
  }

  async process(job: Job<ClipGenerationJobData>): Promise<void> {
    const { videoId: videoIdStr, userId } = job.data;
    const videoId = parseInt(videoIdStr, 10);

    this.logger.log(
      `Processing clip-generation job ${job.id} for video ${videoId}`,
    );

    try {
      // ── 10% — job started ────────────────────────────────────────────────
      await job.updateProgress(10);
      this.emitProgress(userId, videoId, 10, 0, 'Validating video input…', job);

      await this.prisma.video.update({
        where: { id: videoId },
        data: { status: 'processing' },
      });

      // ── 30% — simulating AI detection ───────────────────────────────────
      // In production this is where VideoService.detectViralTimestamps() runs.
      await job.updateProgress(30);
      this.emitProgress(
        userId,
        videoId,
        30,
        0,
        'Detecting viral moments with AI…',
        job,
      );

      // ── 50% — first clips generated ─────────────────────────────────────
      await job.updateProgress(50);
      this.emitProgress(
        userId,
        videoId,
        50,
        0,
        'Generating and uploading clips…',
        job,
      );

      // ── 80% — processing complete ────────────────────────────────────────
      await job.updateProgress(80);
      this.emitProgress(
        userId,
        videoId,
        80,
        0,
        'Finalising clip records…',
        job,
      );

      // Fetch the clips created for this video to report the final count
      const clipsGenerated = await this.prisma.clip.count({
        where: { videoId },
      });

      // ── 100% — done ──────────────────────────────────────────────────────
      await job.updateProgress(100);

      await this.prisma.video.update({
        where: { id: videoId },
        data: { status: 'completed' },
      });

      if (this.progressGateway) {
        this.progressGateway.emitCompleted(userId, videoId, clipsGenerated);
      }

      this.logger.log(
        `Job ${job.id}: video ${videoId} processed — ${clipsGenerated} clip(s)`,
      );
    } catch (err) {
      this.logger.error(
        `Job ${job.id} failed for video ${videoId}: ${err.message}`,
      );

      await this.prisma.video
        .update({
          where: { id: videoId },
          data: { status: 'failed', processingError: err.message },
        })
        .catch(() => {
          /* best-effort */
        });

      if (this.progressGateway) {
        this.progressGateway.emitFailed(userId, videoId, err.message);
      }

      throw err;
    }
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<ClipGenerationJobData>, err: Error): void {
    const { videoId: videoIdStr, userId } = job.data;
    const videoId = parseInt(videoIdStr, 10);
    const isTimeout = err.message?.toLowerCase().includes('timeout');
    const reason = isTimeout ? 'Job timed out after 30 minutes' : err.message;

    this.logger.warn(
      `Job ${job.id} for video ${videoId} permanently failed: ${reason}`,
    );

    if (this.progressGateway) {
      this.progressGateway.emitFailed(userId, videoId, reason);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Internal helpers
  // ─────────────────────────────────────────────────────────────

  private emitProgress(
    userId: number,
    videoId: number,
    percent: number,
    clipsGenerated: number,
    message: string,
    job: Job,
  ): void {
    if (!this.progressGateway) return;

    this.progressGateway.emitProgress(userId, {
      videoId,
      percent,
      clipsGenerated,
      message,
      timestamp: new Date().toISOString(),
    });
  }
}
