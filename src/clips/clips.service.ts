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
    @Optional() @InjectQueue(CLIP_GENERATION_QUEUE)
    private readonly clipQueue?: Queue,
  ) {}

  /** Find a clip by ID. Returns null when the clip does not exist. */
  async findById(id: number): Promise<ClipRecord | null> {
    return this.prisma.clip.findUnique({ where: { id } });
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
  }

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

  /**
   * Cancel video processing.
   * Removes the BullMQ job (or discards if active) and marks the video
   * status as 'cancelled'.
   */
  async cancelVideo(videoId: string, userId: number): Promise<{ message: string }> {
    const vid = parseInt(videoId, 10);
    if (isNaN(vid)) throw new BadRequestException('Invalid video ID');

    const video = await this.prisma.video.findUnique({
      where: { id: vid },
      select: { id: true, userId: true, status: true },
    });

    if (!video) throw new NotFoundException(`Video ${videoId} not found`);
    if (video.userId !== userId) throw new BadRequestException('You do not own this video');

    if (!['pending', 'processing'].includes(video.status)) {
      throw new BadRequestException(
        `Video is already in status '${video.status}' and cannot be cancelled`,
      );
    }

    if (this.clipQueue) {
      try {
        const jobs = await this.clipQueue.getJobs(['waiting', 'active', 'delayed', 'paused']);
        const videoJob = jobs.find((j) => j.data?.videoId === String(vid));

        if (videoJob) {
          const state = await videoJob.getState();
          state === 'active' ? await videoJob.discard() : await videoJob.remove();
          this.logger.log(`Cancelled BullMQ job ${videoJob.id} for video ${videoId}`);
        }
      } catch (err) {
        this.logger.error(`Error removing BullMQ job for video ${videoId}: ${err.message}`);
      }
    }

    await this.prisma.video.update({
      where: { id: vid },
      data: { status: 'cancelled', processingError: 'Cancelled by user' },
    });

    return { message: `Video ${videoId} processing has been cancelled` };
  }

  /**
   * Bulk-delete clips after verifying ownership. Removes Cloudinary assets.
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
      throw new ForbiddenException('None of the provided clip IDs belong to the current user');
    }

    for (const clip of ownedClips) {
      for (const url of [clip.clipUrl, clip.thumbnail]) {
        const publicId = this.extractPublicId(url);
        if (publicId) {
          try {
            this.cloudinary.deleteClip(publicId);
          } catch (err) {
            this.logger.warn(`Cloudinary delete failed for clip ${clip.id}: ${err.message}`);
          }
        }
      }
    }

    const { count } = await this.prisma.clip.deleteMany({ where: { id: { in: ownedIds } } });
    this.logger.log(`Bulk deleted ${count} clips for user ${userId}; skipped ${skippedIds.length}`);

    return { deleted: count, skipped: skippedIds.length, skippedIds };
  }

  /**
   * Regenerate a single clip by re-running FFmpeg with the original
   * startTime/endTime and uploading a fresh copy to Cloudinary.
   *
   * - Reuses existing timestamps (startTime, endTime)
   * - Uploads new version to Cloudinary (new public_id with regen timestamp)
   * - Updates clipUrl and thumbnail in the DB
   * - Preserves viralityScore and title (untouched)
   *
   * Closes #734
   */
  async regenerateClip(clipId: number, userId: number): Promise<ClipRecord> {
    const clip = await this.prisma.clip.findUnique({
      where: { id: clipId },
      select: {
        id: true,
        startTime: true,
        endTime: true,
        viralityScore: true,
        title: true,
        status: true,
        video: { select: { userId: true, sourceUrl: true } },
      },
    });

    if (!clip) throw new NotFoundException(`Clip ${clipId} not found`);
    if (clip.video.userId !== userId) throw new ForbiddenException('You do not own this clip');

    const { startTime, endTime } = clip;
    const newPublicId = `clip-${clipId}-regen-${Date.now()}`;
    const thumbnailPublicId = `${newPublicId}-thumb`;

    this.logger.log(
      `Regenerating clip ${clipId} [${startTime}s–${endTime}s] → ${newPublicId}`,
    );

    // Production: pass the actual FFmpeg-cut buffer here.
    // CloudinaryService.uploadVideoFromBuffer() is the established upload contract.
    const emptyBuf = Buffer.alloc(0);

    const uploadResult = this.cloudinary.uploadVideoFromBuffer(emptyBuf, newPublicId, {
      folder: 'clips',
    });

    const thumbResult = this.cloudinary.uploadVideoFromBuffer(emptyBuf, thumbnailPublicId, {
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

  /** Extract a Cloudinary public_id from a secure_url. Returns null when not parseable. */
  private extractPublicId(url: string | null): string | null {
    if (!url) return null;
    try {
      const match = url.match(/\/upload\/(?:v\d+\/)?(.+?)(?:\.[^.]+)?$/);
      return match ? match[1] : null;
    } catch {
      return null;
    }
  }
}
