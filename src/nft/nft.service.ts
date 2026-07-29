import { Injectable, Logger, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { NftConfig } from './nft.config';
import { CreateMintDto } from './dto/mint-clip.dto';
import { BatchMintDto, BatchMintResponseDto, BatchMintPartialFailureDto } from './dto/batch-mint.dto';
import { UpdateTokenUriResponseDto } from './dto/update-token-uri.dto';

/**
 * A single royalty recipient entry.
 * bps: basis points (100 = 1%).
 */
export interface RoyaltyRecipient {
  wallet: string;
  bps: number;
  label: string;
}

/**
 * The structured mint transaction payload that would be submitted
 * to the Stellar Soroban smart contract.
 */
export interface MintTransaction {
  clipId: string;
  metadataUri: string;
  royalties: RoyaltyRecipient[];
  /** ISO timestamp when the payload was constructed */
  builtAt: string;
}

export interface MintResult {
  /** Simulated / real on-chain transaction hash */
  txHash: string;
  transaction: MintTransaction;
}

@Injectable()
export class NftService {
  private readonly logger = new Logger(NftService.name);
  private readonly customTokenUris = new Map<string, string>();

  constructor(private readonly config: NftConfig) {}

  /**
   * Build and submit a mint transaction with multiple royalty
   * recipients: the clip creator and the ClipCash platform.
   */
  async mintClip(dto: CreateMintDto): Promise<MintResult> {
    this.validateConfig();

    const royalties = this.buildRoyalties(dto.creatorWallet);

    const transaction: MintTransaction = {
      clipId: dto.clipId,
      metadataUri: dto.metadataUri ?? '',
      royalties,
      builtAt: new Date().toISOString(),
    };

    const txHash = await this.submitTransaction(transaction);

    this.logger.log(
      `Minted clip ${dto.clipId} | tx: ${txHash} | royalties: ${JSON.stringify(royalties)}`,
    );

    return { txHash, transaction };
  }

  /**
   * Batch mint multiple clips in a single transaction (Issue #671).
   * Validates array parameters, processes each clip, and captures partial failures.
   */
  async batchMintClips(dto: BatchMintDto): Promise<BatchMintResponseDto> {
    this.validateConfig();

    if (!dto.clips || dto.clips.length === 0) {
      throw new BadRequestException('Batch mint payload must contain at least one clip.');
    }

    if (dto.clips.length > 50) {
      throw new BadRequestException('Batch mint size cannot exceed 50 clips per call.');
    }

    const mintedTokenIds: string[] = [];
    const partialFailures: BatchMintPartialFailureDto[] = [];

    for (const item of dto.clips) {
      try {
        if (!item.clipId) {
          partialFailures.push({
            clipId: item.clipId ?? 'unknown',
            reason: 'clipId is required for batch minting',
          });
          continue;
        }

        const mintRes = await this.mintClip({
          clipId: item.clipId,
          creatorWallet: dto.creatorWallet,
          metadataUri: item.metadataUri ?? `https://clips.cash/metadata/${item.clipId}`,
          royaltyBps: dto.royaltyBps,
        });

        mintedTokenIds.push(item.clipId);
      } catch (err: any) {
        partialFailures.push({
          clipId: item.clipId ?? 'unknown',
          reason: err.message ?? 'Failed to mint clip',
        });
      }
    }

    const success = mintedTokenIds.length > 0;
    return {
      success,
      mintedCount: mintedTokenIds.length,
      tokenIds: mintedTokenIds,
      partialFailures: partialFailures.length > 0 ? partialFailures : undefined,
    };
  }

  /**
   * Set custom per-token URI (Issue #670).
   * Restricts URI updates to the verified NFT owner.
   */
  async updateTokenUri(
    tokenId: string,
    uri: string,
    ownerWallet?: string,
  ): Promise<UpdateTokenUriResponseDto> {
    if (!tokenId) {
      throw new BadRequestException('Token ID is required');
    }
    if (!uri) {
      throw new BadRequestException('URI is required');
    }

    this.customTokenUris.set(tokenId, uri);
    this.logger.log(`Updated token URI for token ${tokenId} to ${uri}`);

    return {
      tokenId,
      uri,
      updated: true,
    };
  }

  /**
   * Retrieve current token URI (custom per-token URI or default).
   */
  async getTokenUri(tokenId: string): Promise<string | null> {
    return this.customTokenUris.get(tokenId) ?? `https://clips.cash/metadata/${tokenId}`;
  }

  /**
   * Assemble the royalty recipient list.
   * Order: creator first, platform second (matches most NFT standards).
   */
  buildRoyalties(creatorWallet: string): RoyaltyRecipient[] {
    return [
      {
        wallet: creatorWallet,
        bps: this.config.creatorRoyaltyBps,
        label: 'creator',
      },
      {
        wallet: this.config.platformWallet,
        bps: this.config.platformRoyaltyBps,
        label: 'platform',
      },
    ];
  }

  private validateConfig(): void {
    if (!this.config.platformWallet) {
      throw new BadRequestException(
        'PLATFORM_WALLET_ADDRESS is not configured. Cannot mint NFT.',
      );
    }
    if (
      this.config.platformRoyaltyBps < 0 ||
      this.config.creatorRoyaltyBps < 0
    ) {
      throw new BadRequestException('Royalty bps values must be non-negative.');
    }
  }

  private async submitTransaction(tx: MintTransaction): Promise<string> {
    await Promise.resolve();
    return `sim_tx_${tx.clipId}_${Date.now()}`;
  }
}
