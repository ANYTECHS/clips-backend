import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Prevents minting clips that are already minted, in progress, posted, or not ready.
 * Apply before prepare-mint and queue enqueue endpoints.
 */
@Injectable()
export class NftMintGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

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
    clipUrl: string | null;
    clipPosts: { status: string }[];
  }): Promise<void> {
    if (clip.nftStatus === 'minting' || clip.nftStatus === 'minted') {
      throw new BadRequestException(
        'Clip is already being minted or has been minted',
      );
    }

    if (clip.mintAddress) {
      throw new BadRequestException('Clip has already been minted on-chain');
    }

    // Check if clip is posted (either via postStatus or any published clipPost)
    const isPosted = clip.postStatus === 'posted' || 
      clip.clipPosts.some(post => post.status === 'published');
    
    if (isPosted) {
      throw new BadRequestException('Posted clips cannot be minted.');
    }

    if (!clip.clipUrl) {
      throw new BadRequestException(
        'Clip is not ready for minting (missing URL)',
      );
    }
  }
}
