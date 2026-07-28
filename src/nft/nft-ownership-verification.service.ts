import { Injectable, Logger } from '@nestjs/common';
import { StellarService } from '../stellar/stellar.service';
import { NftOwnershipService } from './nft-ownership.service';

export type NftOwnershipCheckResult =
  | { valid: true }
  | { valid: false; error: string };

@Injectable()
export class NftOwnershipVerificationService {
  private readonly logger = new Logger(NftOwnershipVerificationService.name);

  constructor(
    private readonly nftOwnershipService: NftOwnershipService,
    private readonly stellarService: StellarService,
  ) {}

  /**
   * Authoritative on-chain ownership check for an NFT.
   *
   * Validates both inputs, queries the Soroban NFT contract via owner_of,
   * and returns a standardised result with no caching involved.
   *
   * @param mintAddress  Numeric token ID (clip.id cast to string)
   * @param walletAddress Stellar Ed25519 public key to check against
   */
  async verifyNFTOwnership(
    mintAddress: string,
    walletAddress: string,
  ): Promise<NftOwnershipCheckResult> {
    // --- 1. Validate mintAddress -----------------------------------------------
    const tokenIdNum = Number(mintAddress?.trim());
    if (
      !mintAddress?.trim() ||
      !Number.isInteger(tokenIdNum) ||
      tokenIdNum <= 0
    ) {
      return {
        valid: false,
        error: `Invalid NFT identifier "${mintAddress}": must be a positive integer`,
      };
    }

    // --- 2. Validate walletAddress ---------------------------------------------
    const addressCheck = this.stellarService.validateAddress(walletAddress);
    if (!addressCheck.valid) {
      return {
        valid: false,
        error: addressCheck.message ?? 'Invalid wallet address',
      };
    }

    // --- 3. Query on-chain via existing service (circuit-breaker included) -----
    this.logger.log(
      `Verifying NFT ownership on-chain: mintAddress=${mintAddress}, wallet=${walletAddress}`,
    );

    const result = await this.nftOwnershipService.verifyNFTOwnership(
      mintAddress,
      walletAddress,
    );

    if (result.isOwner) {
      return { valid: true };
    }

    // ownerAddress being set means the contract returned a valid owner — just
    // not the wallet provided (ownership mismatch, not a technical failure).
    if (result.ownerAddress !== undefined) {
      return {
        valid: false,
        error: 'NFT is not owned by the specified wallet',
      };
    }

    // Technical failure: missing token, simulation error, RPC/network issue.
    return {
      valid: false,
      error: result.error ?? 'Ownership verification failed',
    };
  }
}
