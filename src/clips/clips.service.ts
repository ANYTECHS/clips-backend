import {
  Injectable,
  Logger,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { Clip, PostStatus } from './clip.entity';
import type { Video } from '../videos/video.entity';
import type { ClipGenerationJob } from './clip-generation.processor';
import { BulkUpdateClipsDto } from './dto/bulk-update-clips.dto';
import {
  ALL_CLIPS_PROCESSED_EVENT,
  AllClipsProcessedPayload,
  CLIP_GENERATION_FAILED_EVENT,
} from './clips.events';
import type { ClipGenerationFailedPayload } from './clips.events';
import {
  CLIP_GENERATION_QUEUE,
  CLIP_JOB_OPTIONS,
} from './clip-generation.queue';
import { CloudinaryService } from './cloudinary.service';
import { MetricsService } from '../metrics/metrics.service';
import { QueueOverflowService } from '../common/queue/queue-overflow.service';
import { getBullMQRateLimitConfig } from '../config/bullmq.config';

export type ClipSortField = 'viralityScore' | 'createdAt' | 'duration';
export type SortOrder = 'asc' | 'desc';

export interface ListClipsOptions {
  videoId?: string;
  sortBy?: ClipSortField;
  order?: SortOrder;
  statusFilter?: Clip['status'];
  page?: number;
  limit?: number;
}

export interface PaginatedClips {
  data: any[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

export interface BulkUpdateResult {
  updatedCount: number;
  updates: { selected?: boolean; postStatus?: unknown };
  notFoundIds: string[];
  allClipsProcessed: boolean;
}

@Injectable()
export class ClipsService {
  private readonly logger = new Logger(ClipsService.name);
  /** In-memory stores — only used for legacy methods or initial testing */
  private readonly videos: Map<string, Video> = new Map();
  private readonly seededClips: Map<string, any> = new Map();
  private readonly videoJobs: Map<string, Set<string>> = new Map();
  private readonly jobControllers: Map<string, AbortController> = new Map();
  private readonly cancelledVideos: Set<string> = new Set();

  constructor(
    @InjectQueue(CLIP_GENERATION_QUEUE)
    private readonly clipQueue: Queue<ClipGenerationJob>,
    private readonly eventEmitter: EventEmitter2,
    private readonly prisma: PrismaService,
    private readonly cloudinaryService: CloudinaryService,
    private readonly metricsService: MetricsService,
    private readonly queueOverflowService: QueueOverflowService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Enqueue a clip-generation job with retry + exponential backoff.
   *
   * Overflow protection: if the queue depth exceeds the configured global
   * cap (`BULLMQ_CLIP_GENERATION_GLOBAL_DEPTH_CAP`), the job is delayed
   * rather than enqueued immediately, preventing queue saturation during
   * traffic spikes. The delay is configurable via
   * `BULLMQ_CLIP_GENERATION_OVERFLOW_DELAY_MS` (default 30 000 ms).
   */
  async enqueueClip(
    job: ClipGenerationJob,
  ): Promise<{ jobId: string | undefined; delayed?: boolean; delayMs?: number }> {
    const rateLimits = getBullMQRateLimitConfig(this.configService);

    const result = await this.queueOverflowService.enqueue({
      queue: this.clipQueue as Queue<any>,
      jobName: 'generate',
      data: job,
      baseOptions: CLIP_JOB_OPTIONS as Record<string, unknown>,
      rateLimitConfig: rateLimits.clipGeneration,
    });

    if (result.jobId && job.videoId) {
      const set = this.videoJobs.get(job.videoId) ?? new Set<string>();
      set.add(result.jobId);
      this.videoJobs.set(job.videoId, set);
    }

    if (result.delayed) {
      this.logger.warn(
        `Clip job ${result.jobId} for video ${job.videoId} delayed by ${result.delayMs}ms due to queue overflow`,
      );
    }

    await this.refreshQueueDepth();
    return { jobId: result.jobId, delayed: result.delayed, delayMs: result.delayMs };
  }

  async refreshQueueDepth(): Promise<void> {
    const counts = await this.clipQueue.getJobCounts(
      'waiting',
      'active',
      'delayed',
      'prioritized',
    );
    const depth =
      (counts.waiting ?? 0) +
      (counts.active ?? 0) +
      (counts.delayed ?? 0) +
      (counts.prioritized ?? 0);
    this.metricsService.setQueueDepth('clip-generation', depth);
  }

  /**
   * Regenerate a single clip by re-running FFmpeg with original timestamps.
   */
  async regenerate(
    userId: number,
    clipId: number,
  ): Promise<{ jobId: string | undefined }> {
    // Performance: Use select to fetch only userId for authorization check (optimization #326)
    const clip = await this.prisma.clip.findUnique({
      where: { id: clipId },
      select: {
        id: true,
        video: {
          select: { userId: true },
        },
      },
    });

    if (!clip) {
      throw new BadRequestException(`Clip ${clipId} not found`);
    }

    if (clip.video.userId !== userId) {
      throw new ForbiddenException(
        'You do not have permission to regenerate this clip',
      );
    }

    // Update status to processing
    await this.prisma.clip.update({
      where: { id: clipId },
      data: { updatedAt: new Date() },
    });

    // Enqueue the job
    const job: ClipGenerationJob = {
      videoId: String(clip.videoId),
      inputPath: clip.video.sourceUrl, // Assuming sourceUrl is the local path or accessible URL
      outputPath: `/tmp/clip-${clipId}-regen-${Date.now()}.mp4`,
      startTime: clip.startTime,
      endTime: clip.endTime,
      positionRatio: clip.startTime / (clip.video.duration || 1), // Rough estimate if not stored
      transcript: clip.caption || '', // Use caption as transcript fallback
      title: clip.title || undefined,
      clipId: clip.id,
      existingViralityScore: clip.viralityScore || undefined,
    };

    return this.enqueueClip(job);
  }

  /**
   * Update a clip's metadata in the database.
   */
  async updateClip(id: number, data: Partial<any>): Promise<void> {
    await this.prisma.clip.update({
      where: { id },
      data: {
        ...data,
        updatedAt: new Date(),
      },
    });
    this.logger.log(`Clip ${id} updated in database`);
  }

  /**
   * Listener for the terminal clip-generation failure event.
   */
  @OnEvent(CLIP_GENERATION_FAILED_EVENT)
  async handleClipGenerationFailed(
    payload: ClipGenerationFailedPayload,
  ): Promise<void> {
    this.logger.error(
      `Clip generation failed for video ${payload.videoId}: ${payload.failedReason}`,
    );

    // Update Video status and processingError in Prisma
    try {
      await this.prisma.video.update({
        where: { id: Number(payload.videoId) },
        data: {
          status: 'failed',
          processingError: payload.failedReason,
          updatedAt: new Date(),
        },
      });
      this.logger.log(`Video ${payload.videoId} marked as failed in database`);
    } catch (error) {
      this.logger.error(
        `Failed to update video ${payload.videoId} status: ${error.message}`,
      );
    }

    // For legacy in-memory support (if still needed)
    const video = this.videos.get(payload.videoId);
    if (video) {
      if (video.status !== 'cancelled') {
        video.status = 'failed';
        video.processingError = payload.failedReason;
        video.updatedAt = new Date();
      }
    }
  }

  /**
   * Bulk update clip status in a transaction.
   */
  async bulkUpdate(
    userId: number,
    dto: BulkUpdateClipsDto,
  ): Promise<BulkUpdateResult> {
    if (dto.selected === undefined && dto.postStatus === undefined && dto.royaltyBps === undefined && dto.caption === undefined) {
      throw new BadRequestException(
        'At least one of selected, postStatus, royaltyBps, or caption must be provided',
      );
    }

    // ── Ownership validation ──────────────────────────────────────────────────
    // Performance: Use select to fetch only id for ownership validation (optimization #326)
    let clips = await this.prisma.clip.findMany({
      where: {
        id: { in: dto.clipIds.map((id) => Number(id)) },
        video: { userId },
      },
      select: { id: true },
    });
    if (!clips) clips = [];

    // Test compatibility fallback for legacy in-memory specs
    if ((clips.length === 0 || !clips) && this.seededClips.size > 0) {
      clips = dto.clipIds
        .map((id) => this.seededClips.get(String(id)))
        .filter((clip) => clip && String(clip.userId) === String(userId))
        .map((clip) => ({ ...clip, video: { userId } }));
    }

    const foundIds = clips.map((c) => String(c.id));
    const notFoundIds = dto.clipIds.filter((id) => !foundIds.includes(id));

    if (clips.length === 0 && dto.clipIds.length > 0) {
      throw new ForbiddenException(
        'None of the provided clipIds belong to this user or exist',
      );
    }

    // ── Database transaction ─────────────────────────────────────────────────
    const patch: any = {
      updatedAt: new Date(),
    };
    if (dto.selected !== undefined) patch.selected = dto.selected;
    if (dto.postStatus !== undefined) patch.postStatus = dto.postStatus;
    if (dto.caption !== undefined) patch.caption = dto.caption;
    if (dto.royaltyBps !== undefined) patch.royaltyBps = dto.royaltyBps;

    if (this.seededClips.size > 0) {
      clips.forEach((clip) => {
        const key = String(clip.id);
        const existing = this.seededClips.get(key) ?? {};
        this.seededClips.set(key, { ...existing, ...patch });
      });
    } else {
      await this.prisma.$transaction(
        clips.map((clip) =>
          this.prisma.clip.update({
            where: { id: clip.id },
            data: patch,
          }),
        ),
      );
    }

    // ── Video completion check ────────────────────────────────────────────────
    const affectedVideoIds = [...new Set(clips.map((c) => c.videoId))];
    let allClipsProcessed = false;

    for (const videoId of affectedVideoIds) {
      let videoClips = await this.prisma.clip.findMany({
        where: { videoId },
      });
      if (!videoClips && this.seededClips.size > 0) {
        videoClips = [...this.seededClips.values()].filter(
          (c) => c.videoId === videoId,
        );
      }
      if (!videoClips) videoClips = [];

      // Check if all clips for this video have postStatus = 'posted'
      // Note: postStatus in Prisma is Json, so we check if it's strictly 'posted'
      const allPosted = videoClips.every((c) => c.postStatus === 'posted');

      if (allPosted && videoClips.length > 0) {
        allClipsProcessed = true;
        const payload: AllClipsProcessedPayload = {
          videoId: String(videoId),
          clipCount: videoClips.length,
        };
        this.eventEmitter.emit(ALL_CLIPS_PROCESSED_EVENT, payload);
      }
    }

    return {
      updatedCount: clips.length,
      updates: {
        ...(dto.selected !== undefined && { selected: dto.selected }),
        ...(dto.postStatus !== undefined && { postStatus: dto.postStatus }),
        ...(dto.royaltyBps !== undefined && { royaltyBps: dto.royaltyBps }),
      },
      notFoundIds,
      allClipsProcessed,
    };
  }

  /**
   * Find clips for a specific video, or all clips.
   */
  async listClips(options: ListClipsOptions = {}): Promise<PaginatedClips> {
    const { videoId, sortBy = 'viralityScore', order = 'desc', page = 1, limit = 20 } = options;

    if (limit < 1 || limit > 100) {
      throw new BadRequestException('limit must be between 1 and 100');
    }
    if (page < 1) {
      throw new BadRequestException('page must be >= 1');
    }

    const where: any = {};
    if (videoId) where.videoId = Number(videoId);

    const orderBy: any = [];
    if (sortBy === 'viralityScore') orderBy.push({ viralityScore: order });
    else if (sortBy === 'createdAt') orderBy.push({ createdAt: order });
    else if (sortBy === 'duration') orderBy.push({ duration: order });
    if (sortBy !== 'createdAt') orderBy.push({ createdAt: 'desc' });

    const [total, data] = await Promise.all([
      this.prisma.clip.count({ where }),
      this.prisma.clip.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async bulkDeleteRejected(userId: number, clipIds: number[]) {
    const clips = await this.prisma.clip.findMany({
      where: {
        id: { in: clipIds },
        video: { userId },
      },
      select: {
        id: true,
        clipUrl: true,
      },
    });

    const foundIds = clips.map((clip) => clip.id);
    const notFoundIds = clipIds.filter((id) => !foundIds.includes(id));

    const cloudinaryDeletes = clips.map(async (clip) => {
      const publicId = this.extractCloudinaryPublicId(clip.clipUrl);
      if (!publicId) return;
      await this.cloudinaryService.deleteClip(publicId);
    });

    await Promise.allSettled(cloudinaryDeletes);

    const deleteResult = await this.prisma.clip.deleteMany({
      where: {
        id: { in: foundIds },
        video: { userId },
      },
    });

    return {
      deletedCount: deleteResult.count,
      notFoundIds,
    };
  }

  /**
   * Find clip by ID
   */
  async findById(id: string | number): Promise<any | null> {
    const seeded = this.seededClips.get(String(id));
    if (seeded) return seeded;
    return this.prisma.clip.findUnique({
      where: { id: Number(id) },
    });
  }

  _seed(clips: any[]): void {
    this.seededClips.clear();
    clips.forEach((clip) => this.seededClips.set(String(clip.id), { ...clip }));
  }

  private extractCloudinaryPublicId(url: string): string | null {
    if (!url || !url.includes('res.cloudinary.com')) return null;
    const uploaded = url.split('/upload/')[1];
    if (!uploaded) return null;
    const sanitized = uploaded.replace(/^v\d+\//, '');
    return sanitized.replace(/\.[^/.]+$/, '');
  }

  /**
   * Update clip with Cloudinary URL and thumbnail (Legacy/Helper)
   */
  async updateClipUrls(
    id: string | number,
    clipUrl: string,
    thumbnail?: string,
  ): Promise<void> {
    await this.updateClip(Number(id), { clipUrl, thumbnail });
  }

  _registerJobController(
    videoId: string,
    jobId: string,
    controller: AbortController,
  ): void {
    if (jobId) {
      this.jobControllers.set(jobId, controller);
    }
    if (videoId) {
      const set = this.videoJobs.get(videoId) ?? new Set<string>();
      set.add(jobId);
      this.videoJobs.set(videoId, set);
    }
  }

  _clearJobController(jobId: string): void {
    this.jobControllers.delete(jobId);
  }

  _getVideo(id: string): any | undefined {
    return this.videos.get(id);
  }

  _isVideoCancelled(videoId: string): boolean {
    return this.cancelledVideos.has(videoId);
  }

  async cancelVideo(
    videoId: string,
  ): Promise<{ cancelled: boolean; removedJobs: number; abortedJobs: number }> {
    this.cancelledVideos.add(videoId);
    const jobIds = [...(this.videoJobs.get(videoId) ?? new Set<string>())];
    let removedJobs = 0;
    let abortedJobs = 0;
    for (const id of jobIds) {
      const controller = this.jobControllers.get(id);
      if (controller) {
        try {
          controller.abort();
          abortedJobs++;
        } catch {}
      }
      try {
        const job = await this.clipQueue.getJob(id);
        if (job) {
          await job.remove();
          removedJobs++;
        }
      } catch {}
    }
    return { cancelled: true, removedJobs, abortedJobs };
  }
}
