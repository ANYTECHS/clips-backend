import { Injectable, Logger } from '@nestjs/common';
import { StellarService } from '../stellar/stellar.service';
import { NftOwnershipService } from './nft-ownership.service';

export type NftOwnershipCheckResult = {
  owner: boolean;
  message: string;
  valid?: boolean;
  error?: string;
};

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
      const errorMsg = `Invalid NFT identifier "${mintAddress}": must be a positive integer`;
      return {
        owner: false,
        message: errorMsg,
        valid: false,
        error: errorMsg,
      };
    }

    // --- 2. Validate walletAddress ---------------------------------------------
    const addressCheck = this.stellarService.validateAddress(walletAddress);
    if (!addressCheck.valid) {
      const errorMsg = addressCheck.message ?? 'Invalid wallet address';
      return {
        owner: false,
        message: errorMsg,
        valid: false,
        error: errorMsg,
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
      return {
        owner: true,
        message: 'Wallet owns NFT',
        valid: true,
      };
    }

    // ownerAddress being set means the contract returned a valid owner — just
    // not the wallet provided (ownership mismatch, not a technical failure).
    if (result.ownerAddress !== undefined) {
      return {
        owner: false,
        message: 'Wallet does not own NFT',
        valid: false,
        error: 'NFT is not owned by the specified wallet',
      };
    }

    // Technical failure: missing token, simulation error, RPC/network issue.
    const errorMsg = result.error ?? 'Ownership verification failed';
    return {
      owner: false,
      message: errorMsg,
      valid: false,
      error: errorMsg,
    };
  }

  /**
   * Alias for verifyNFTOwnership matching the standard ownership check signature.
   */
  async verifyOwnership(
    mintAddress: string,
    walletAddress: string,
  ): Promise<NftOwnershipCheckResult> {
    return this.verifyNFTOwnership(mintAddress, walletAddress);
  }
}

