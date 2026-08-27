import {
  BadRequestException,
  CanActivate,
  ConflictException,
  ExecutionContext,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { StellarService, LOW_BALANCE_THRESHOLD_XLM } from '../../stellar/stellar.service';
import {
  isClipPosted,
  POSTED_CLIP_MINT_ERROR,
} from '../../clips/clip-post-status.util';

/**
 * Prevents minting clips that are already minted, in progress, posted, not ready,
 * or when the creator wallet has insufficient XLM to cover transaction fees.
 * Apply before prepare-mint and queue enqueue endpoints.
 */
@Injectable()
export class NftMintGuard implements CanActivate {
  private readonly logger = new Logger(NftMintGuard.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stellarService: StellarService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const clipId = this.resolveClipId(request);

    if (!clipId) {
      throw new BadRequestException('clipId is required for NFT minting');
    }

    const clip = await this.prisma.clip.findUnique({
      where: { id: clipId },
      include: {
        clipPosts: {
          select: { status: true },
        },
      },
    });

    if (!clip) {
      throw new NotFoundException(`Clip with ID ${clipId} not found`);
    }

    await this.assertMintable(clip);

    // Check wallet balance before minting to prevent failed on-chain transactions
    const walletAddress = request.body?.creatorWallet ?? request.body?.walletAddress;
    if (walletAddress && typeof walletAddress === 'string') {
      await this.assertSufficientBalance(walletAddress, clipId);
    }

    return true;
  }

  private resolveClipId(request: {
    body?: { clipId?: number | string };
    params?: { clipId?: string; id?: string };
  }): number | null {
    const fromBody = request.body?.clipId;
    if (fromBody !== undefined && fromBody !== null) {
      const parsed = Number(fromBody);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    }

    const fromParams = request.params?.clipId ?? request.params?.id;
    if (fromParams !== undefined) {
      const parsed = Number(fromParams);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    }

    return null;
  }

  private async assertMintable(clip: {
    nftStatus: string;
    mintAddress: string | null;
    postStatus: unknown;
    postedAt: Date | null;
    clipUrl: string | null;
    clipPosts: { status: string }[];
  }): Promise<void> {
    if (clip.nftStatus === 'minting' || clip.nftStatus === 'minted') {
      throw new ConflictException(
        'Clip is already being minted or has been minted',
      );
    }

    if (clip.mintAddress) {
      throw new ConflictException('Clip has already been minted on-chain');
    }

    // Business rule (Issue #764): posted clips cannot be minted. The predicate
    // is shared with ClipsService.preventPostedMint so the guard and the
    // service-level check can never disagree about what "posted" means.
    if (isClipPosted(clip)) {
      throw new BadRequestException(POSTED_CLIP_MINT_ERROR);
    }

    if (!clip.clipUrl) {
      throw new BadRequestException(
        'Clip is not ready for minting (missing URL)',
      );
    }
  }

  /**
   * Verify the creator wallet has enough XLM to cover the Stellar network
   * base fee plus the minimum reserve.  Rejects the mint early rather than
   * letting it fail on-chain with a cryptic error.
   */
  private async assertSufficientBalance(
    walletAddress: string,
    clipId: number,
  ): Promise<void> {
    try {
      const validation = this.stellarService.validateAddress(walletAddress);
      if (!validation.valid) {
        this.logger.warn(
          `Skipping balance check for clip ${clipId}: invalid address format`,
        );
        return;
      }

      const balance = await this.stellarService.getAccountBalance(walletAddress);
      if (balance < LOW_BALANCE_THRESHOLD_XLM) {
        throw new BadRequestException(
          `Insufficient wallet balance to cover minting fees. ` +
          `Your wallet has ${balance.toFixed(2)} XLM but at least ${LOW_BALANCE_THRESHOLD_XLM} XLM is recommended. ` +
          `Top up your wallet and try again.`,
        );
      }
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      // If Horizon is unreachable, log a warning but don't block the mint —
      // the user may be on a different network or the check is best-effort.
      this.logger.warn(
        `Balance pre-check failed for clip ${clipId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
