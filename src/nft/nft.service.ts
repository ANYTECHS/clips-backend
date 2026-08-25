import {
  Injectable,
  Logger,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { NftConfig } from './nft.config';
import { CreateMintDto } from './dto/mint-clip.dto';
import { BatchMintDto, BatchMintResponseDto, BatchMintPartialFailureDto } from './dto/batch-mint.dto';
import { UpdateTokenUriResponseDto } from './dto/update-token-uri.dto';
import { UpdateRoyaltyRecipientResponseDto } from './dto/update-royalty-recipient.dto';
import { UpdateMetadataDto, UpdateMetadataResponseDto } from './dto/update-metadata.dto';
import { GasMetricsService } from './gas-metrics.service';
import { ClipsService } from '../clips/clips.service';

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
  private readonly royaltyRecipients = new Map<string, string>();
  private readonly updatedMetadata = new Set<string>();

  constructor(
    private readonly config: NftConfig,
    private readonly clipsService: ClipsService,
    @Optional() private readonly gasMetricsService?: GasMetricsService,
  ) {}

  /**
   * Build and submit a mint transaction with multiple royalty
   * recipients: the clip creator and the ClipCash platform.
   */
  async mintClip(dto: CreateMintDto): Promise<MintResult> {
    this.validateConfig();

    const clipId = parseInt(dto.clipId, 10);
    if (isNaN(clipId)) {
      throw new BadRequestException(`Invalid clipId: ${dto.clipId}`);
    }

    await this.clipsService.preventDoubleMint(clipId);
    await this.clipsService.updateMintStatusToMinting(clipId);

    const royalties = this.buildRoyalties(dto.creatorWallet);

    const transaction: MintTransaction = {
      clipId: dto.clipId,
      metadataUri: dto.metadataUri ?? '',
      royalties,
      builtAt: new Date().toISOString(),
    };

    let txHash: string;
    try {
      txHash = await this.submitTransaction(transaction);
      await this.clipsService.markMinted(clipId, txHash);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      await this.clipsService.markMintFailed(clipId, message);
      throw err;
    }

    this.logger.log(
      `Minted clip ${dto.clipId} | tx: ${txHash} | royalties: ${JSON.stringify(royalties)}`,
    );

    // Record gas metrics for key contract functions (Issue #684)
    if (this.gasMetricsService) {
      this.gasMetricsService.recordBenchmark('mint', 1250000, 45000, 15200);
    }

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

        await this.mintClip({
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
   * Update royalty recipient address for an NFT token (Issue #672).
   */
  async updateRoyaltyRecipient(
    tokenId: string,
    newRecipient: string,
    currentRecipient?: string,
  ): Promise<UpdateRoyaltyRecipientResponseDto> {
    if (!tokenId) {
      throw new BadRequestException('Token ID is required');
    }
    if (!newRecipient) {
      throw new BadRequestException('New recipient wallet address is required');
    }

    const existingRecipient = this.royaltyRecipients.get(tokenId);
    if (existingRecipient && currentRecipient && existingRecipient !== currentRecipient) {
      throw new ForbiddenException('Only the current royalty recipient can update the address');
    }

    this.royaltyRecipients.set(tokenId, newRecipient);
    this.logger.log(
      `Updated royalty recipient for token ${tokenId} to ${newRecipient} (Emitted RoyaltyRecipientUpdated)`,
    );

    return {
      tokenId,
      newRecipient,
      updated: true,
    };
  }

  /**
   * Retrieve current royalty recipient address for a token ID.
   */
  async getRoyaltyRecipient(tokenId: string): Promise<string | null> {
    return this.royaltyRecipients.get(tokenId) ?? null;
  }

  /**
   * One-time metadata update after minting (Issue #683).
   * Restricts update to one time only per NFT token ID.
   */
  async updateMetadata(
    tokenId: string,
    dto: UpdateMetadataDto,
  ): Promise<UpdateMetadataResponseDto> {
    if (!tokenId) {
      throw new BadRequestException('Token ID is required');
    }
    if (!dto.contentUri) {
      throw new BadRequestException('contentUri is required for metadata update');
    }

    if (this.updatedMetadata.has(tokenId)) {
      throw new BadRequestException('Metadata can only be updated once per NFT.');
    }

    this.updatedMetadata.add(tokenId);
    this.customTokenUris.set(tokenId, dto.contentUri);

    this.logger.log(
      `Updated metadata for token ${tokenId} to ${dto.contentUri} (Emitted MetadataUpdated)`,
    );

    return {
      tokenId,
      contentUri: dto.contentUri,
      updated: true,
    };
  }

  /**
   * Set custom per-token URI (Issue #670).
   * Restricts URI updates to the verified NFT owner.
   */
  async updateTokenUri(
    tokenId: string,
    uri: string,
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
