import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service';
import {
  NFT_MINTABLE_KEY,
  NftMintableOptions,
} from '../decorators/nft-mintable.decorator';

@Injectable()
export class NftMintGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const options =
      this.reflector.get<NftMintableOptions>(NFT_MINTABLE_KEY, context.getHandler()) ??
      ({ clipIdParam: 'clipId' } satisfies NftMintableOptions);

    const request = context.switchToHttp().getRequest();
    const clipIdParam = options.clipIdParam ?? 'clipId';
    const clipId = this.resolveClipId(request, clipIdParam);

    if (clipId === undefined || clipId === null) {
      throw new BadRequestException('clipId is required for NFT minting');
    }

    const clip = await this.prisma.clip.findUnique({
      where: { id: Number(clipId) },
      select: {
        id: true,
        clipUrl: true,
        nftStatus: true,
        mintAddress: true,
        postStatus: true,
      },
    });

    if (!clip) {
      throw new NotFoundException(`Clip with ID ${clipId} not found`);
    }

    if (!clip.clipUrl) {
      throw new BadRequestException(
        'Clip is not ready for minting (missing clipUrl)',
      );
    }

    if (clip.nftStatus === 'minting' || clip.nftStatus === 'minted') {
      throw new BadRequestException(
        'Clip is already being minted or has been minted',
      );
    }

    if (clip.mintAddress) {
      throw new BadRequestException('Clip has already been minted on-chain');
    }

    if (this.isPosted(clip.postStatus)) {
      throw new BadRequestException('Posted clips cannot be minted as NFTs');
    }

    return true;
  }

  private resolveClipId(
    request: {
      params?: Record<string, string>;
      body?: Record<string, unknown>;
    },
    clipIdParam: string,
  ): unknown {
    if (request.params?.[clipIdParam] !== undefined) {
      return request.params[clipIdParam];
    }
    return request.body?.[clipIdParam];
  }

  private isPosted(postStatus: unknown): boolean {
    if (!postStatus || typeof postStatus !== 'object') {
      return false;
    }

    if (Array.isArray(postStatus)) {
      return postStatus.length > 0;
    }

    return Object.values(postStatus as Record<string, unknown>).some(Boolean);
  }
}
