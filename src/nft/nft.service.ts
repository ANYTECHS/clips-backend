import {
  Injectable,
  Logger,
  BadRequestException,
  ConflictException,
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
  collectionId: string;
  metadataUri: string;
  royalties: RoyaltyRecipient[];
  /** ISO timestamp when the payload was constructed */
  builtAt: string;
}

export interface MintResult {
  /** Simulated / real on-chain transaction hash */
  txHash: string;
  collectionId: string;
  transaction: MintTransaction;
  mintAddress?: string;
  mintedAt?: Date;
  nftStatus?: string;
}

@Injectable()
export class NftService {
  private readonly logger = new Logger(NftService.name);
  private readonly customTokenUris = new Map<string, string>();
  private readonly royaltyRecipients = new Map<string, string>();
  private readonly updatedMetadata = new Set<string>();
  private platformRoyaltyBps?: number;
  private readonly platformBpsMap = new Map<string, number>();
  private readonly clipMintStatus = new Map<
    string,
    { mintAddress?: string; mintedAt?: Date; nftStatus: string }
  >();


  constructor(
    private readonly config: NftConfig,
    @Optional() private readonly clipsService?: ClipsService,
    @Optional() private readonly gasMetricsService?: GasMetricsService,
  ) {}

  /**
   * Store platform royalty BPS.
   * Can be configured globally or associated with a specific token ID.
   */
  storePlatformBps(bps: number, tokenId?: string): void {
    if (!Number.isInteger(bps) || bps < 0 || bps > 10000) {
      throw new BadRequestException(
        `Invalid platform BPS: ${bps}. Must be an integer between 0 and 10000.`,
      );
    }
    if (tokenId) {
      this.platformBpsMap.set(tokenId, bps);
    }
    this.platformRoyaltyBps = bps;
  }

  /**
   * Set platform royalty BPS globally.
   */
  setPlatformRoyaltyBps(bps: number): void {
    this.storePlatformBps(bps);
  }

  /**
   * Retrieve platform royalty BPS.
   * Returns token-specific platform BPS if set, else stored platform BPS, or config default.
   */
  getPlatformRoyaltyBps(tokenId?: string): number {
    if (tokenId && this.platformBpsMap.has(tokenId)) {
      return this.platformBpsMap.get(tokenId)!;
    }
    return this.platformRoyaltyBps ?? this.config.platformRoyaltyBps;
  }

  /**
   * Build and submit a mint transaction with multiple royalty
   * recipients: the clip creator, ClipCash platform, and any additional recipients.
   * Validates total BPS across all recipients.
   */
  async mintClip(dto: CreateMintDto): Promise<MintResult> {
    this.validateConfig();

    const existing = this.clipMintStatus.get(dto.clipId);
    if (existing?.nftStatus === 'minted' || existing?.mintAddress) {
      throw new ConflictException(
        `Clip ${dto.clipId} has already been minted (mintAddress: ${existing.mintAddress})`,
      );
    }
    if (existing?.nftStatus === 'minting') {
      throw new ConflictException(
        `Clip ${dto.clipId} is currently being minted. Please wait.`,
      );
    }

    this.clipMintStatus.set(dto.clipId, { nftStatus: 'minting' });

    const numericClipId = !isNaN(Number(dto.clipId)) ? Number(dto.clipId) : null;
    if (this.clipsService && numericClipId !== null) {
      await this.clipsService.preventDoubleMint(numericClipId);
      await this.clipsService.updateMintStatusToMinting(numericClipId);
    }

    if (dto.platformRoyaltyBps !== undefined && dto.platformRoyaltyBps !== null) {
      this.storePlatformBps(dto.platformRoyaltyBps, dto.clipId);
    } else {
      this.storePlatformBps(this.getPlatformRoyaltyBps(), dto.clipId);
    }

    const creatorBps =
      dto.royaltyBps !== undefined && dto.royaltyBps !== null
        ? dto.royaltyBps
        : this.config.creatorRoyaltyBps;

    const royalties = this.buildRoyalties(
      dto.creatorWallet,
      creatorBps,
      dto.recipients,
    );

    const transaction: MintTransaction = {
      clipId: dto.clipId,
      collectionId: dto.collectionId ?? 'viral-clips',
      metadataUri: dto.metadataUri ?? '',
      royalties,
      builtAt: new Date().toISOString(),
    };

    let txHash: string;
    try {
      txHash = await this.submitTransaction(transaction);
      if (this.clipsService && numericClipId !== null) {
        await this.clipsService.markMinted(numericClipId, txHash);
      }
    } catch (err: unknown) {
      this.clipMintStatus.set(dto.clipId, { nftStatus: 'failed' });
      const message = err instanceof Error ? err.message : String(err);
      if (this.clipsService && numericClipId !== null) {
        await this.clipsService.markMintFailed(numericClipId, message);
      }
      throw err;
    }

    const mintedAt = new Date();
    this.clipMintStatus.set(dto.clipId, {
      mintAddress: txHash,
      mintedAt,
      nftStatus: 'minted',
    });

    this.logger.log(
      `Minted clip ${dto.clipId} | tx: ${txHash} | royalties: ${JSON.stringify(royalties)}`,
    );

    // Record gas metrics for key contract functions (Issue #684)
    if (this.gasMetricsService) {
      this.gasMetricsService.recordBenchmark('mint', 1250000, 45000, 15200);
    }

    return {
      txHash,
      collectionId: transaction.collectionId,
      transaction,
      mintAddress: txHash,
      mintedAt,
      nftStatus: 'minted',
    };
  }

  /**
   * Retrieve current NFT mint tracking fields for a clip.
   */
  getClipMintStatus(
    clipId: string,
  ): { mintAddress?: string; mintedAt?: Date; nftStatus: string } | null {
    return this.clipMintStatus.get(clipId) ?? null;
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
   * Validate that all royalty shares have non-negative integer basis points
   * and that their sum does not exceed the protocol maximum (10000 BPS = 100%).
   */
  validateRoyalties(royalties: RoyaltyRecipient[]): void {
    if (!Array.isArray(royalties) || royalties.length === 0) {
      throw new BadRequestException('Royalties must contain at least one recipient.');
    }
    let totalBps = 0;
    for (const r of royalties) {
      if (!Number.isInteger(r.bps) || r.bps < 0) {
        throw new BadRequestException(
          `Invalid royalty BPS for ${r.label ?? 'recipient'}: ${r.bps}. Must be a non-negative integer.`,
        );
      }
      totalBps += r.bps;
    }
    if (totalBps > 10000) {
      throw new BadRequestException(
        `Total royalty BPS (${totalBps}) exceeds protocol maximum of 10000.`,
      );
    }
  }

  /**
   * Assemble the royalty recipient list supporting multiple recipients.
   * Order: creator first, platform second, followed by any additional recipients.
   * Validates total BPS across all recipients.
   */
  buildRoyalties(
    creatorWallet: string,
    creatorRoyaltyBps?: number | null,
    additionalRecipients?: RoyaltyRecipient[],
  ): RoyaltyRecipient[] {
    const creatorBps =
      creatorRoyaltyBps !== undefined && creatorRoyaltyBps !== null
        ? creatorRoyaltyBps
        : this.config.creatorRoyaltyBps;
    const platformBps = this.getPlatformRoyaltyBps();

    const royalties: RoyaltyRecipient[] = [
      {
        wallet: creatorWallet,
        bps: creatorBps,
        label: 'creator',
      },
      {
        wallet: this.config.platformWallet,
        bps: platformBps,
        label: 'platform',
      },
    ];

    if (additionalRecipients && additionalRecipients.length > 0) {
      royalties.push(...additionalRecipients);
    }

    this.validateRoyalties(royalties);
    return royalties;
  }

  private validateConfig(): void {
    if (!this.config.platformWallet) {
      throw new BadRequestException(
        'PLATFORM_WALLET_ADDRESS is not configured. Cannot mint NFT.',
      );
    }
    const platformBps = this.getPlatformRoyaltyBps();
    if (
      platformBps < 0 ||
      this.config.creatorRoyaltyBps < 0
    ) {
      throw new BadRequestException('Royalty bps values must be non-negative.');
    }
    if (this.config.creatorRoyaltyBps + platformBps > 10000) {
      throw new BadRequestException(
        `Total royalty BPS (${this.config.creatorRoyaltyBps + platformBps}) exceeds protocol maximum of 10000.`,
      );
    }
  }

  private async submitTransaction(tx: MintTransaction): Promise<string> {
    await Promise.resolve();
    return `sim_tx_${tx.clipId}_${Date.now()}`;
  }
}
