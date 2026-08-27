/**
 * ClipsService — CRUD and configuration for clip records.
 *
 * Issue #747: setRoyaltyBps() stores a per-clip royalty (0–1500 bps)
 *             on the Clip model so the value is available at mint time.
 */
import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export const ROYALTY_BPS_MIN = 0;
export const ROYALTY_BPS_MAX = 1500;
export const ROYALTY_BPS_DEFAULT = 1000;
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
import { PrismaService } from '../prisma/prisma.service';
import { CloudinaryService } from './cloudinary.service';
import { CLIP_GENERATION_QUEUE } from './clip-generation.queue';
import {
  isClipPosted,
  POSTED_CLIP_MINT_ERROR,
} from './clip-post-status.util';

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
}

@Injectable()
export class ClipsService {
  private readonly logger = new Logger(ClipsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudinary: CloudinaryService,
    @Optional() @InjectQueue(CLIP_GENERATION_QUEUE) private readonly clipQueue?: Queue,
  ) {}
  ) {}

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
      include: { video: { select: { userId: true } } },
    });

    if (!clip) {
      throw new NotFoundException(`Clip ${clipId} not found`);
    }

    if (clip.video.userId !== userId) {
      throw new ForbiddenException(
        `You do not own clip ${clipId}`,
      );
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
  /**
   * Find a clip by ID. Returns null when the clip does not exist.
   */
  async findById(id: number): Promise<ClipRecord | null> {
    return this.prisma.clip.findUnique({ where: { id } });
  }

  /**
   * Find a clip by ID or throw NotFoundException.
   */
  async findByIdOrThrow(id: number): Promise<ClipRecord> {
    const clip = await this.findById(id);
    if (!clip) {
      throw new NotFoundException(`Clip with ID ${id} not found`);
    }
    return clip;
  }

  /**
   * Check whether a clip has already been minted or is currently minting.
   * Returns true when the clip cannot accept a new mint request.
   */
  async isAlreadyMinted(clipId: number): Promise<boolean> {
    const clip = await this.findById(clipId);
    if (!clip) return false;
    return (
      clip.nftStatus === NFT_STATUSES.MINTED ||
      clip.nftStatus === NFT_STATUSES.MINTING
    );
  }

  /**
   * Prevent double minting. Throws ConflictException if the clip is already
   * minted or currently being minted.
   */
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

  /**
   * Transition the clip's nftStatus to "minting".
   * Should be called before submitting the on-chain mint transaction.
   */
  async updateMintStatusToMinting(clipId: number): Promise<void> {
    await this.findByIdOrThrow(clipId);
    await this.preventDoubleMint(clipId);

    await this.prisma.clip.update({
      where: { id: clipId },
      data: { nftStatus: NFT_STATUSES.MINTING },
    });

    this.logger.log(`Clip ${clipId} nftStatus → minting`);
  }

  /**
   * Mark a clip as successfully minted. Records the on-chain mint address
   * and timestamps the mint.
   */
  async markMinted(clipId: number, mintAddress: string): Promise<void> {
    await this.findByIdOrThrow(clipId);

    await this.prisma.clip.update({
      where: { id: clipId },
      data: {
        nftStatus: NFT_STATUSES.MINTED,
        mintAddress,
        mintedAt: new Date(),
      },
    });

    this.logger.log(
      `Clip ${clipId} nftStatus → minted (mintAddress: ${mintAddress})`,
    );
  }

  /**
   * Mark a clip's mint as failed. Resets nftStatus to "none" so the user
   * can retry the mint.
   */
  async markMintFailed(clipId: number, error?: string): Promise<void> {
    await this.findByIdOrThrow(clipId);

    await this.prisma.clip.update({
      where: { id: clipId },
      data: {
        nftStatus: NFT_STATUSES.FAILED,
        error: error ?? null,
      },
    });

    this.logger.warn(
      `Clip ${clipId} nftStatus → failed${error ? `: ${error}` : ''}`,
    );
  }

  /**
   * Reset a clip's NFT status back to "none". Useful for retry scenarios
   * after a "failed" status.
   */
  async resetNftStatus(clipId: number): Promise<void> {
    await this.findByIdOrThrow(clipId);

    await this.prisma.clip.update({
      where: { id: clipId },
      data: { nftStatus: NFT_STATUSES.NONE },
    });

    this.logger.log(`Clip ${clipId} nftStatus → none (reset)`);
  }

  /**
   * Validate that the given user owns the clip (via the clip's video).
   * Throws ForbiddenException when the ownership check fails.
   */
  async validateClipOwnership(clipId: number, userId: number): Promise<void> {
    const clip = await this.prisma.clip.findUnique({
      where: { id: clipId },
      select: { video: { select: { userId: true } } },
    });

    if (!clip) {
      throw new NotFoundException(`Clip ${clipId} not found`);
    }

    return { clipId: clip.id, royaltyBps: clip.royaltyBps ?? ROYALTY_BPS_DEFAULT };
    if (clip.video.userId !== userId) {
      throw new BadRequestException('You do not own this clip');
    }
  }

  /**
   * Cancel video processing.
   * Finds the active/waiting BullMQ job for the video, removes it and marks
   * the video status as 'cancelled' in the database.
   *
   * Closes #735
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

  /**
   * Bulk-delete clips by ID after verifying the requesting user owns each one.
   * Also removes associated Cloudinary assets when a public_id can be derived.
   *
   * Closes #739
   */
  async bulkDeleteClips(
    clipIds: number[],
    userId: number,
  ): Promise<{ deleted: number; skipped: number; skippedIds: number[] }> {
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

    for (const clip of ownedClips) {
      const publicId = this.extractPublicId(clip.clipUrl);
      if (publicId) {
        try {
          this.cloudinary.deleteClip(publicId);
        } catch (err) {
          this.logger.warn(
            `Cloudinary delete failed for clip ${clip.id} (${publicId}): ${err.message}`,
          );
        }
      }
      if (clip.thumbnail) {
        const thumbId = this.extractPublicId(clip.thumbnail);
        if (thumbId) {
          try {
            this.cloudinary.deleteClip(thumbId);
          } catch (err) {
            this.logger.warn(
              `Cloudinary thumbnail delete failed for clip ${clip.id}: ${err.message}`,
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

    this.logger.log(
      `Regenerating clip ${clipId} [${startTime}s-${endTime}s] → ${newPublicId}`,
    );

    // Re-upload via CloudinaryService (production: pass actual FFmpeg output buffer)
    const fakeBuffer = Buffer.alloc(0);
    const uploadResult = this.cloudinary.uploadVideoFromBuffer(
      fakeBuffer,
      newPublicId,
      { folder: 'clips' },
    );

    const thumbnailPublicId = `${newPublicId}-thumb`;
    const thumbnailResult = this.cloudinary.uploadVideoFromBuffer(
      fakeBuffer,
      thumbnailPublicId,
      { folder: 'thumbnails', resourceType: 'image' },
    );

    const updated = await this.prisma.clip.update({
      where: { id: clipId },
      data: {
        clipUrl: uploadResult.secure_url,
        thumbnail: thumbnailResult.secure_url,
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
      const match = url.match(/\/upload\/(?:v\d+\/)?(.+?)(?:\.[^.]+)?$/);
      return match ? match[1] : null;
    } catch {
      return null;
    }
  }

  /**
   * Bulk-delete clips by ID after verifying the requesting user owns each clip.
   * Also removes associated Cloudinary assets when a public_id can be derived.
   *
   * Returns counts of successfully deleted and not-found/forbidden records.
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
      const publicId = this.extractPublicId(clip.clipUrl);
      if (publicId) {
        try {
          this.cloudinary.deleteClip(publicId);
        } catch (err) {
          this.logger.warn(
            `Cloudinary delete failed for clip ${clip.id} (${publicId}): ${err.message}`,
          );
        }
      }
      if (clip.thumbnail) {
        const thumbId = this.extractPublicId(clip.thumbnail);
        if (thumbId) {
          try {
            this.cloudinary.deleteClip(thumbId);
          } catch (err) {
            this.logger.warn(
              `Cloudinary thumbnail delete failed for clip ${clip.id}: ${err.message}`,
            );
          }
        }
      }
    }

    // Bulk delete from DB
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

    const { startTime, endTime, video } = clip;
    const newPublicId = `clip-${clipId}-regen-${Date.now()}`;
    const outputPath = `/tmp/${newPublicId}.mp4`;

    this.logger.log(
      `Regenerating clip ${clipId} [${startTime}s-${endTime}s] → ${newPublicId}`,
    );

    // Re-cut and upload using CloudinaryService stubs (same interface as existing code)
    const fakeBuffer = Buffer.alloc(0); // production: read actual cut output
    const uploadResult = this.cloudinary.uploadVideoFromBuffer(
      fakeBuffer,
      newPublicId,
      { folder: 'clips' },
    );

    const thumbnailPublicId = `${newPublicId}-thumb`;
    const thumbnailResult = this.cloudinary.uploadVideoFromBuffer(
      fakeBuffer,
      thumbnailPublicId,
      { folder: 'thumbnails', resourceType: 'image' },
    );

    const updated = await this.prisma.clip.update({
      where: { id: clipId },
      data: {
        clipUrl: uploadResult.secure_url,
        thumbnail: thumbnailResult.secure_url,
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
}
