import {
  Injectable,
  Logger,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
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

  constructor(private readonly prisma: PrismaService) {}

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

    if (clip.video.userId !== userId) {
      throw new BadRequestException('You do not own this clip');
    }
  }

  /**
   * Cancel video processing for a clip set.
   * Placeholder — full implementation depends on the clip generation queue.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  cancelVideo(videoId: string, userId: number): { message: string } {
    return { message: `Cancellation requested for video ${videoId}` };
  }
}
