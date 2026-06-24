import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  BadRequestException,
} from '@nestjs/common';
import { NftOwnershipService } from '../nft-ownership.service';

/**
 * Validates on-chain NFT ownership before protected actions.
 * Expects tokenId in route params and walletAddress in body or query.
 */
@Injectable()
export class NftOwnershipGuard implements CanActivate {
  constructor(private readonly nftOwnershipService: NftOwnershipService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const tokenId =
      request.params?.tokenId ??
      request.params?.mintAddress ??
      request.body?.tokenId;
    const walletAddress =
      request.body?.walletAddress ?? request.query?.walletAddress;

    if (!tokenId) {
      throw new BadRequestException('tokenId is required for ownership verification');
    }
    if (!walletAddress || typeof walletAddress !== 'string') {
      throw new BadRequestException(
        'walletAddress is required for ownership verification',
      );
    }

    const result = await this.nftOwnershipService.verifyNFTOwnership(
      String(tokenId),
      walletAddress,
    );

    if (!result.isOwner) {
      throw new ForbiddenException(
        result.error ?? 'Caller does not own the NFT on-chain',
      );
    }

    return true;
  }
}
