import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { StellarService } from '../stellar/stellar.service';
import { ConfigService } from '../config/config.service';
import { NftOwnershipService } from './nft-ownership.service';

export interface OwnershipStatusResponse {
  owner: boolean;
  message: string;
}

/**
 * Service to verify NFT ownership directly from the Soroban smart contract.
 */
@Injectable()
export class OwnershipService {
  private readonly logger = new Logger(OwnershipService.name);

  constructor(
    private readonly nftOwnershipService: NftOwnershipService,
    private readonly stellarService: StellarService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Verify NFT ownership directly from Soroban.
   * Queries the contract's owner_of method and returns whether the wallet owns the NFT.
   *
   * @param tokenId Numeric NFT token ID
   * @param walletAddress Stellar wallet address
   * @returns { owner: boolean, message: string }
   */
  async verifyOwnership(
    tokenId: string,
    walletAddress: string,
    contractId?: string,
  ): Promise<OwnershipStatusResponse> {
    if (!tokenId || !tokenId.toString().trim()) {
      throw new BadRequestException('Token ID is required');
    }

    const addrCheck = this.stellarService.validateAddress(walletAddress);
    if (!addrCheck.valid) {
      throw new BadRequestException(
        addrCheck.message ?? `Invalid Stellar wallet address: ${walletAddress}`,
      );
    }

    this.logger.log(
      `Querying Soroban contract for NFT ownership: tokenId=${tokenId}, wallet=${walletAddress}`,
    );

    const result = await this.nftOwnershipService.verifyNFTOwnership(
      tokenId.toString().trim(),
      walletAddress,
      contractId,
    );

    if (result.isOwner) {
      return {
        owner: true,
        message: 'Wallet owns NFT',
      };
    }

    return {
      owner: false,
      message: result.ownerAddress
        ? 'Wallet does not own NFT'
        : (result.error ?? 'Wallet does not own NFT'),
    };
  }
}
