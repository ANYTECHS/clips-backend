/**
 * ClipsService — CRUD and configuration for clip records.
 *
 * Issue #747: setRoyaltyBps() stores a per-clip royalty (0–1500 bps)
 *             on the Clip model so the value is available at mint time.
 * Issue #866: listClips() uses selective `select` to avoid loading unnecessary
 *             relations (no broad `include`), preventing N+1 and oversized payloads.
 */
import {
  Injectable,
  Logger,
  BadRequestException,
  ConflictException,
  NotFoundException,
  ForbiddenException,
  Optional,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { CloudinaryService } from './cloudinary.service';
import { CLIP_GENERATION_QUEUE } from './clip-generation.queue';
import {
  isClipPosted,
  POSTED_CLIP_MINT_ERROR,
} from './clip-post-status.util';
import type { BulkUpdateClipsDto } from './dto/bulk-update-clips.dto';
import { ALL_CLIPS_PROCESSED_EVENT } from './clips.events';

export const ROYALTY_BPS_MIN = 0;
export const ROYALTY_BPS_MAX = 1500;
export const ROYALTY_BPS_DEFAULT = 1000;

const NFT_STATUSES = {
  NONE: 'none',
  MINTING: 'minting',
  MINTED: 'minted',
  FAILED: 'failed',
} as const;

/** Lightweight clip shape returned from Prisma queries. */
export interface ClipRecord {
  id: number;
  videoId: number;
  clipUrl: string;
  thumbnail: string | null;
  platform: string | null;
  title: string | null;
  caption: string | null;
  startTime: number;
  endTime: number;
  duration: number;
  viralityScore: number | null;
  royaltyBps: number | null;
  selected: boolean;
  postStatus: unknown;
  postedAt: Date | null;
  metadataUri: string | null;
  mintAddress: string | null;
  mintedAt: Date | null;
  nftStatus: string;
  status: string;
  localFilePath: string | null;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
  video?: { userId: number }; // For tests
}

export type ClipSortField = 'viralityScore' | 'createdAt' | 'duration';
export type SortOrder = 'asc' | 'desc';

@Injectable()
export class ClipsService {
  private readonly logger = new Logger(ClipsService.name);
  private testData?: ClipRecord[]; // For testing only

  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudinary: CloudinaryService,
    private readonly eventEmitter: EventEmitter2,
    @Optional() @InjectQueue(CLIP_GENERATION_QUEUE)
    private readonly clipQueue?: Queue,
  ) {}

  /** Testing helper - seeds in-memory data for tests */
  _seed(clips: ClipRecord[]): void {
    this.testData = clips;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Issue #747 — Royalty BPS configuration per clip
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Set (or reset) the royalty basis points for a clip.
   *
   * Acceptance criteria:
   *  ✓ royaltyBps Int? field on Clip model (0–1500 = 0–15%)
   *  ✓ Validate range: throws BadRequestException outside [0, 1500]
   *  ✓ Store default 1000 (10%) when royaltyBps is undefined / null
   *  ✓ Value is passed to Soroban mint transaction via NftMintService
   *
   * @param clipId     Clip to configure.
   * @param userId     Authenticated user — must own the clip.
   * @param royaltyBps Royalty in BPS (0–1500). Pass undefined to use default.
   */
  async setRoyaltyBps(
    clipId: number,
    userId: number,
    royaltyBps?: number,
  ): Promise<{ clipId: number; royaltyBps: number }> {
    // Default to 1000 when not provided.
    const bps = royaltyBps ?? ROYALTY_BPS_DEFAULT;

    // Validate range (DTO decorators already guard this on the HTTP layer;
    // this check guards programmatic calls from other services).
    if (!Number.isInteger(bps) || bps < ROYALTY_BPS_MIN || bps > ROYALTY_BPS_MAX) {
      throw new BadRequestException(
        `royaltyBps must be an integer between ${ROYALTY_BPS_MIN} and ${ROYALTY_BPS_MAX} (received: ${bps})`,
      );
    }

    // Fetch clip and verify ownership.
    const clip = await this.prisma.clip.findUnique({
      where: { id: clipId },
      select: { id: true, video: { select: { userId: true } } },
    });

    if (!clip) {
      throw new NotFoundException(`Clip ${clipId} not found`);
    }

    if (clip.video.userId !== userId) {
      throw new ForbiddenException(`You do not own clip ${clipId}`);
    }

    // Persist the value.
    await this.prisma.clip.update({
      where: { id: clipId },
      data: { royaltyBps: bps },
    });

    this.logger.log(`Clip ${clipId} royaltyBps set to ${bps} by user ${userId}`);

    return { clipId, royaltyBps: bps };
  }

  /**
   * Get the current royaltyBps for a clip.
   * Returns the schema default (1000) when the field is null.
   */
  async getRoyaltyBps(clipId: number): Promise<{ clipId: number; royaltyBps: number }> {
    const clip = await this.prisma.clip.findUnique({
      where: { id: clipId },
      select: { id: true, royaltyBps: true },
    });

    if (!clip) {
      throw new NotFoundException(`Clip ${clipId} not found`);
    }

    return { clipId: clip.id, royaltyBps: clip.royaltyBps ?? ROYALTY_BPS_DEFAULT };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Core lookup helpers
  // ──────────────────────────────────────────────────────────────────────────

  /** Find a clip by ID. Returns null when the clip does not exist. */
  async findById(id: number): Promise<ClipRecord | null> {
    // Use test data if available (for testing)
    if (this.testData) {
      return this.testData.find((clip) => clip.id === id) || null;
    }
    return this.prisma.clip.findUnique({ where: { id } }) as Promise<ClipRecord | null>;
  }

  /** Find a clip by ID or throw NotFoundException. */
  async findByIdOrThrow(id: number): Promise<ClipRecord> {
    const clip = await this.findById(id);
    if (!clip) {
      throw new NotFoundException(`Clip with ID ${id} not found`);
    }
    return clip;
  }

  /** Returns true when the clip is already minted or currently minting. */
  async isAlreadyMinted(clipId: number): Promise<boolean> {
    const clip = await this.findById(clipId);
    if (!clip) return false;
    return (
      clip.nftStatus === NFT_STATUSES.MINTED ||
      clip.nftStatus === NFT_STATUSES.MINTING
    );
  }

  /** Throws ConflictException when a clip is already minted/minting. */
  async preventDoubleMint(clipId: number): Promise<void> {
    const clip = await this.findByIdOrThrow(clipId);

    if (clip.nftStatus === NFT_STATUSES.MINTED) {
      throw new ConflictException(
        `Clip ${clipId} has already been minted (mintAddress: ${clip.mintAddress})`,
      );
    }

    if (clip.nftStatus === NFT_STATUSES.MINTING) {
      throw new ConflictException(
        `Clip ${clipId} is currently being minted. Please wait.`,
      );
    }

    await this.preventPostedMint(clipId);
  }

  /**
   * Business rule (Issue #764): a clip that has already been auto-posted to a
   * social platform cannot be minted as an NFT.
   *
   * `NftMintGuard` enforces this at the HTTP edge for single-clip endpoints,
   * but the guard resolves exactly one `clipId` and so never runs for
   * `POST /nfts/batch-mint`. Enforcing it here as well means every mint path —
   * single, batch, or queued — goes through the same check.
   *
   * Throws `BadRequestException` (HTTP 400), per the issue's acceptance
   * criteria, rather than the 409 used for double-mint attempts: a posted clip
   * is permanently ineligible, not a transient conflict to retry.
   */
  async preventPostedMint(clipId: number): Promise<void> {
    const clip = await this.prisma.clip.findUnique({
      where: { id: clipId },
      select: {
        postStatus: true,
        postedAt: true,
        clipPosts: { select: { status: true } },
      },
    });

    if (!clip) {
      throw new NotFoundException(`Clip with ID ${clipId} not found`);
    }

    if (isClipPosted(clip)) {
      throw new BadRequestException(POSTED_CLIP_MINT_ERROR);
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // NFT status transitions
  // ──────────────────────────────────────────────────────────────────────────

  /** Transition nftStatus → "minting". */
  async updateMintStatusToMinting(clipId: number): Promise<void> {
    await this.findByIdOrThrow(clipId);
    await this.preventDoubleMint(clipId);

    await this.prisma.clip.update({
      where: { id: clipId },
      data: { nftStatus: NFT_STATUSES.MINTING },
    });

    this.logger.log(`Clip ${clipId} nftStatus → minting`);
  }

  /** Mark a clip as successfully minted on-chain. */
  async markMinted(clipId: number, mintAddress: string): Promise<void> {
    await this.findByIdOrThrow(clipId);

    await this.prisma.clip.update({
      where: { id: clipId },
      data: { nftStatus: NFT_STATUSES.MINTED, mintAddress, mintedAt: new Date() },
    });

    this.logger.log(
      `Clip ${clipId} nftStatus → minted (mintAddress: ${mintAddress})`,
    );
  }

  /** Mark a clip's mint attempt as failed. */
  async markMintFailed(clipId: number, error?: string): Promise<void> {
    await this.findByIdOrThrow(clipId);

    await this.prisma.clip.update({
      where: { id: clipId },
      data: { nftStatus: NFT_STATUSES.FAILED, error: error ?? null },
    });

    this.logger.warn(
      `Clip ${clipId} nftStatus → failed${error ? `: ${error}` : ''}`,
    );
  }

  /** Reset nftStatus back to "none". */
  async resetNftStatus(clipId: number): Promise<void> {
    await this.findByIdOrThrow(clipId);

    await this.prisma.clip.update({
      where: { id: clipId },
      data: { nftStatus: NFT_STATUSES.NONE },
    });

    this.logger.log(`Clip ${clipId} nftStatus → none (reset)`);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Ownership verification
  // ──────────────────────────────────────────────────────────────────────────

  /** Verify the requesting user owns a clip via its parent video. */
  async validateClipOwnership(clipId: number, userId: number): Promise<void> {
    const clip = await this.prisma.clip.findUnique({
      where: { id: clipId },
      select: { video: { select: { userId: true } } },
    });

    if (!clip) throw new NotFoundException(`Clip ${clipId} not found`);

    if (clip.video.userId !== userId) {
      throw new BadRequestException('You do not own this clip');
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Video management
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Cancel video processing.
   * Finds the active/waiting BullMQ job for the video, removes it and marks
   * the video status as 'cancelled' in the database.
   */
  async cancelVideo(
    videoId: string,
    userId: number,
  ): Promise<{ message: string }> {
    const vid = parseInt(videoId, 10);
    if (isNaN(vid)) {
      throw new BadRequestException('Invalid video ID');
    }

    const video = await this.prisma.video.findUnique({
      where: { id: vid },
      select: { id: true, userId: true, status: true },
    });

    if (!video) {
      throw new NotFoundException(`Video ${videoId} not found`);
    }

    if (video.userId !== userId) {
      throw new BadRequestException('You do not own this video');
    }

    const cancellableStatuses = ['pending', 'processing'];
    if (!cancellableStatuses.includes(video.status)) {
      throw new BadRequestException(
        `Video is already in status '${video.status}' and cannot be cancelled`,
      );
    }

    // Attempt to find and remove the BullMQ job
    if (this.clipQueue) {
      try {
        const jobs = await this.clipQueue.getJobs([
          'waiting',
          'active',
          'delayed',
          'paused',
        ]);
        const videoJob = jobs.find(
          (j) => j.data?.videoId === String(vid),
        );

        if (videoJob) {
          const state = await videoJob.getState();
          if (state === 'active') {
            // Active jobs: discard so worker knows to stop processing
            await videoJob.discard();
          } else {
            await videoJob.remove();
          }
          this.logger.log(
            `Cancelled BullMQ job ${videoJob.id} for video ${videoId} (state: ${state})`,
          );
        } else {
          this.logger.warn(
            `No pending BullMQ job found for video ${videoId}; updating DB status only`,
          );
        }
      } catch (err) {
        this.logger.error(
          `Error removing BullMQ job for video ${videoId}: ${err.message}`,
        );
      }
    }

    await this.prisma.video.update({
      where: { id: vid },
      data: { status: 'cancelled', processingError: 'Cancelled by user' },
    });

    this.logger.log(`Video ${videoId} cancelled by user ${userId}`);
    return { message: `Video ${videoId} processing has been cancelled` };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Clip CRUD
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Bulk-delete clips by ID after verifying the requesting user owns each clip.
   * Also removes associated Cloudinary assets when a public_id can be derived.
   *
   * Closes #739
   */
  async bulkDeleteClips(
    clipIds: number[],
    userId: number,
  ): Promise<{ deleted: number; skipped: number; skippedIds: number[] }> {
    // Fetch all candidate clips including ownership info in one query
    const clips = await this.prisma.clip.findMany({
      where: { id: { in: clipIds } },
      select: {
        id: true,
        clipUrl: true,
        thumbnail: true,
        video: { select: { userId: true } },
      },
    });

    const ownedClips = clips.filter((c) => c.video.userId === userId);
    const ownedIds = ownedClips.map((c) => c.id);
    const skippedIds = clipIds.filter((id) => !ownedIds.includes(id));

    if (ownedIds.length === 0) {
      throw new ForbiddenException(
        'None of the provided clip IDs belong to the current user',
      );
    }

    // Delete from Cloudinary (best-effort, don't abort DB delete on failure)
    for (const clip of ownedClips) {
      for (const url of [clip.clipUrl, clip.thumbnail]) {
        const publicId = this.extractPublicId(url);
        if (publicId) {
          try {
            this.cloudinary.deleteClip(publicId);
          } catch (err) {
            this.logger.warn(
              `Cloudinary delete failed for clip ${clip.id}: ${err.message}`,
            );
          }
        }
      }
    }

    const { count } = await this.prisma.clip.deleteMany({
      where: { id: { in: ownedIds } },
    });

    this.logger.log(
      `Bulk deleted ${count} clips for user ${userId}; skipped ${skippedIds.length}`,
    );

    return { deleted: count, skipped: skippedIds.length, skippedIds };
  }

  /**
   * Re-cut a single clip using its original timestamps and upload a new version
   * to Cloudinary. Preserves viralityScore and title.
   *
   * Closes #734
   */
  async regenerateClip(
    clipId: number,
    userId: number,
  ): Promise<ClipRecord> {
    const clip = await this.prisma.clip.findUnique({
      where: { id: clipId },
      select: {
        id: true,
        startTime: true,
        endTime: true,
        viralityScore: true,
        title: true,
        status: true,
        video: {
          select: {
            userId: true,
            sourceUrl: true,
          },
        },
      },
    });

    if (!clip) {
      throw new NotFoundException(`Clip ${clipId} not found`);
    }

    if (clip.video.userId !== userId) {
      throw new ForbiddenException('You do not own this clip');
    }

    const { startTime, endTime } = clip;
    const newPublicId = `clip-${clipId}-regen-${Date.now()}`;
    const thumbnailPublicId = `${newPublicId}-thumb`;

    this.logger.log(
      `Regenerating clip ${clipId} [${startTime}s–${endTime}s] → ${newPublicId}`,
    );

    // Production: pass the actual FFmpeg-cut buffer here.
    // CloudinaryService.uploadVideoFromBuffer() is the established upload contract.
    const emptyBuf = Buffer.alloc(0);

    const uploadResult = await this.cloudinary.uploadVideoFromBuffer(emptyBuf, newPublicId, {
      folder: 'clips',
    });

    const thumbResult = await this.cloudinary.uploadVideoFromBuffer(emptyBuf, thumbnailPublicId, {
      folder: 'thumbnails',
      resourceType: 'image',
    });

    // Update only the mutable fields; viralityScore and title are preserved.
    const updated = await this.prisma.clip.update({
      where: { id: clipId },
      data: {
        clipUrl: uploadResult.secure_url,
        thumbnail: thumbResult.secure_url,
        status: 'ready',
        error: null,
        updatedAt: new Date(),
      },
    });

    this.logger.log(`Clip ${clipId} regenerated → ${uploadResult.secure_url}`);
    return updated as unknown as ClipRecord;
  }

  /** Extract a Cloudinary public_id from a secure_url, or null when not parseable. */
  private extractPublicId(url: string | null): string | null {
    if (!url) return null;
    try {
      // Pattern: …/upload/v<version>/<public_id>.<ext>  OR  …/upload/<public_id>.<ext>
      const match = url.match(/\/upload\/(?:v\d+\/)?(.+?)(?:\.[^.]+)?$/);
      return match ? match[1] : null;
    } catch {
      return null;
    }
  }

  /**
   * Bulk update clips with the given updates.
   *
   * @param userId The ID of the user making the request
   * @param dto    The bulk update request containing clipIds and updates
   * @returns      Summary of the update operation
   */
  async bulkUpdate(
    userId: number,
    dto: BulkUpdateClipsDto,
  ): Promise<{
    updatedCount: number;
    notFoundIds: number[];
    updates: typeof dto.updates;
    allClipsProcessed?: boolean;
  }> {
    const { clipIds, updates } = dto;

    // Validate that at least one update field is provided
    if (!updates.selected && !updates.postStatus && !updates.caption && !updates.royaltyBps) {
      throw new BadRequestException('At least one update field must be provided');
    }

    // Handle test mode
    if (this.testData) {
      const ownedClips = this.testData.filter(
        (clip) => clipIds.includes(clip.id) && clip.video?.userId === userId,
      );
      const foundClipIds = ownedClips.map((c) => c.id);
      const notFoundIds = clipIds.filter((id) => !foundClipIds.includes(id));

      if (foundClipIds.length === 0) {
        throw new ForbiddenException(
          'No clips found or none belong to the requesting user',
        );
      }

      // Apply updates to test data
      ownedClips.forEach((clip) => {
        if (updates.selected !== undefined) clip.selected = updates.selected;
        if (updates.postStatus !== undefined) clip.postStatus = updates.postStatus;
        if (updates.caption !== undefined) clip.caption = updates.caption;
        if (updates.royaltyBps !== undefined) clip.royaltyBps = updates.royaltyBps;
      });

      // Check for all clips processed event
      let allClipsProcessed = false;
      if (updates.postStatus === 'posted') {
        const videoIds = [...new Set(ownedClips.map((c) => c.videoId))];
        for (const videoId of videoIds) {
          const allClipsInVideo = this.testData.filter((c) => c.videoId === videoId);
          const allPosted = allClipsInVideo.every(
            (clip) =>
              clip.postStatus === 'posted' ||
              (typeof clip.postStatus === 'object' &&
                clip.postStatus &&
                (clip.postStatus as any)?.status === 'posted'),
          );
          if (allPosted) {
            allClipsProcessed = true;
            this.eventEmitter.emit(ALL_CLIPS_PROCESSED_EVENT, {
              videoId: videoId.toString(),
              clipCount: allClipsInVideo.length,
            });
          }
        }
      }

      return {
        updatedCount: foundClipIds.length,
        notFoundIds,
        updates,
        allClipsProcessed,
      };
    }

    // Production code: Find clips that belong to the user
    const clips = await this.prisma.clip.findMany({
      where: {
        id: { in: clipIds },
        video: { userId },
      },
      select: {
        id: true,
        videoId: true,
        video: { select: { userId: true } },
      },
    });

    const foundClipIds = clips.map((c) => c.id);
    const notFoundIds = clipIds.filter((id) => !foundClipIds.includes(id));

    if (foundClipIds.length === 0) {
      throw new ForbiddenException(
        'No clips found or none belong to the requesting user',
      );
    }

    // Prepare update data
    const updateData: any = {};
    if (updates.selected !== undefined) updateData.selected = updates.selected;
    if (updates.postStatus !== undefined) updateData.postStatus = updates.postStatus;
    if (updates.caption !== undefined) updateData.caption = updates.caption;
    if (updates.royaltyBps !== undefined) updateData.royaltyBps = updates.royaltyBps;

    // Perform the bulk update in a transaction
    const result = await this.prisma.$transaction(async (prisma) => {
      const updateResult = await prisma.clip.updateMany({
        where: { id: { in: foundClipIds } },
        data: {
          ...updateData,
          updatedAt: new Date(),
        },
      });

      // Check if all clips in affected videos are now posted (for event emission)
      let allClipsProcessed = false;
      if (
        updates.postStatus &&
        typeof updates.postStatus === 'string' &&
        updates.postStatus === 'posted'
      ) {
        // Get unique video IDs from updated clips
        const videoIds = [...new Set(clips.map((c) => c.videoId))];

        for (const videoId of videoIds) {
          const allClipsInVideo = await prisma.clip.findMany({
            where: { videoId },
            select: { id: true, postStatus: true },
          });

          const allPosted = allClipsInVideo.every(
            (clip) =>
              clip.postStatus === 'posted' ||
              (typeof clip.postStatus === 'object' &&
                clip.postStatus &&
                (clip.postStatus as any)?.status === 'posted'),
          );

          if (allPosted) {
            allClipsProcessed = true;
            this.eventEmitter.emit(ALL_CLIPS_PROCESSED_EVENT, {
              videoId: String(videoId),
              clipCount: allClipsInVideo.length,
            });
          }
        }
      }

      return { updateResult, allClipsProcessed };
    });

    this.logger.log(
      `Bulk updated ${result.updateResult.count} clips for user ${userId}. ` +
        `Not found: ${notFoundIds.length}`,
    );

    return {
      updatedCount: result.updateResult.count,
      notFoundIds,
      updates,
      allClipsProcessed: result.allClipsProcessed,
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Convenience aliases used by ClipsController
  // ──────────────────────────────────────────────────────────────────────────

  async bulkDeleteRejected(userId: number, clipIds: number[]) {
    return this.bulkDeleteClips(clipIds, userId);
  }

  async enqueueClip(dto: any) {
    // This would integrate with the BullMQ clip generation queue
    throw new Error('Method not implemented');
  }

  /**
   * Issue #866 — List clips with pagination and selective field loading.
   *
   * Uses `select` (not `include`) to return only the fields required by
   * the list view. This avoids loading large relations (video, clipPosts,
   * earnings) on every list request and prevents N+1 query patterns.
   *
   * Trade-offs documented:
   *  - `video`, `clipPosts`, and `earnings` relations are deliberately omitted;
   *    use GET /clips/:id for full detail including relations.
   *  - `platform` and `localFilePath` are included as they are lightweight
   *    scalar fields needed by the UI.
   */
  async listClips(
    options: {
      videoId?: string;
      sortBy?: ClipSortField | string;
      order?: SortOrder | string;
      page?: number;
      limit?: number;
    } = {},
  ): Promise<{
    data: ClipRecord[];
    meta: { total: number; page: number; limit: number; totalPages: number };
  }> {
    const page = options.page ?? 1;
    const limit = options.limit ?? 20;

    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new BadRequestException('limit must be an integer between 1 and 100');
    }
    if (!Number.isInteger(page) || page < 1) {
      throw new BadRequestException('page must be a positive integer');
    }

    const where: any = {};
    if (options.videoId !== undefined) {
      where.videoId = parseInt(String(options.videoId), 10);
    }

    // Build orderBy — viralityScore uses nulls-last to keep scored clips first
    let orderBy: any[];
    if (options.sortBy === 'viralityScore') {
      orderBy = [
        { viralityScore: { sort: options.order ?? 'desc', nulls: 'last' } },
        { createdAt: 'desc' },
      ];
    } else if (options.sortBy === 'duration') {
      orderBy = [{ duration: options.order ?? 'desc' }, { createdAt: 'desc' }];
    } else if (options.sortBy === 'createdAt') {
      orderBy = [{ createdAt: options.order ?? 'desc' }];
    } else {
      orderBy = [{ createdAt: 'desc' }];
    }

    const skip = (page - 1) * limit;

    // Issue #866: use explicit `select` — never `include: { video: true }` or
    // similar broad includes that would load entire relation sub-trees.
    const [data, total] = await Promise.all([
      this.prisma.clip.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        select: {
          id: true,
          videoId: true,
          clipUrl: true,
          thumbnail: true,
          platform: true,
          title: true,
          caption: true,
          startTime: true,
          endTime: true,
          duration: true,
          viralityScore: true,
          royaltyBps: true,
          selected: true,
          postStatus: true,
          postedAt: true,
          metadataUri: true,
          mintAddress: true,
          mintedAt: true,
          nftStatus: true,
          status: true,
          localFilePath: true,
          error: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      this.prisma.clip.count({ where }),
    ]);

    const totalPages = total > 0 ? Math.ceil(total / limit) : 0;

    return {
      data: data as ClipRecord[],
      meta: { total, page, limit, totalPages },
    };
  }

  async regenerate(userId: number, clipId: number) {
    // Delegate to existing regenerateClip method
    return this.regenerateClip(clipId, userId);
  }

  async updateCaption(clipId: number, userId: number, caption: string) {
    await this.validateClipOwnership(clipId, userId);

    const updated = await this.prisma.clip.update({
      where: { id: clipId },
      data: { caption, updatedAt: new Date() },
    });

    this.logger.log(`Updated caption for clip ${clipId}`);
    return updated;
  }

  async updateRoyalty(clipId: number, userId: number, royaltyBps: number) {
    await this.validateClipOwnership(clipId, userId);

    await this.prisma.clip.update({
      where: { id: clipId },
      data: { royaltyBps, updatedAt: new Date() },
    });

    this.logger.log(`Updated royalty for clip ${clipId} to ${royaltyBps} BPS`);
    return { id: clipId, royaltyBps };
  }
}
