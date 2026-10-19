import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import StellarSdk from '@stellar/stellar-sdk';
import { StellarService } from '../stellar/stellar.service';
import {
  CircuitBreakerService,
  CircuitBreakerConfig,
} from '../common/circuit-breaker/circuit-breaker.service';
import {
  NftOwnerResponseDto,
  NftBalanceResponseDto,
  NftTokenUriResponseDto,
} from './dto/nft-owner.dto';
import {
  RoyaltyConfigResponseDto,
  RoyaltySummaryResponseDto,
} from './dto/nft-royalty.dto';
import {
  GetClipMetadataResponseDto,
  ClipMetadataDto,
  StoreClipMetadataResponseDto,
} from './dto/nft-clip-metadata.dto';

/**
 * Standard NFT query service implementing ERC721-like functions.
 *
 * Provides view-only functions for marketplace compatibility:
 * - owner_of(tokenId): Get the owner of a specific NFT
 * - balance_of(walletAddress): Get NFT count for a wallet
 * - token_uri(tokenId): Get metadata URI for a token
 *
 * Also handles ClipCash-specific extensions for royalties and metadata.
 *
 * Issue #1285 (Soroban NFT Enhancement)
 */
@Injectable()
export class NftStandardQueriesService {
  private readonly logger = new Logger(NftStandardQueriesService.name);

  private readonly sorobanCircuitBreakerConfig: CircuitBreakerConfig = {
    name: 'soroban-nft-queries',
    failureThreshold: 5,
    recoveryTimeout: 30000,
    samplingDuration: 60000,
  };

  // In-memory stores for development/testing
  // In production, these would be queried from the contract
  private readonly nftOwners = new Map<string, string>(); // tokenId -> owner
  private readonly nftMetadataUris = new Map<string, string>(); // tokenId -> uri
  private readonly clipMetadata = new Map<string, ClipMetadataDto>(); // tokenId -> metadata
  private readonly royaltyConfigs = new Map<string, Map<string, RoyaltyConfigResponseDto>>(); // tokenId -> recipient -> config

  constructor(
    private readonly stellarService: StellarService,
    private readonly circuitBreakerService: CircuitBreakerService,
  ) {}

  private get CONTRACT_ID(): string {
    return (
      process.env.SOROBAN_NFT_CONTRACT_ID ||
      'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEU4'
    );
  }

  /**
   * ERC721-like owner_of() function.
   * Returns the owner address of a specific NFT token.
   * View-only function (no state mutations).
   */
  async ownerOf(tokenId: string): Promise<NftOwnerResponseDto> {
    if (!tokenId || isNaN(parseInt(tokenId, 10))) {
      throw new BadRequestException(`Invalid token ID: ${tokenId}`);
    }

    // Try to query from contract first
    try {
      const owner = await this.queryContractOwner(tokenId);
      if (owner) {
        return {
          tokenId,
          owner,
          mintedAt: new Date().toISOString(), // Would come from contract
          collectionId: 'viral-clips',
        };
      }
    } catch (err) {
      this.logger.warn(`Failed to query contract owner for token ${tokenId}: ${err}`);
    }

    // Fall back to in-memory store or throw not found
    const owner = this.nftOwners.get(tokenId);
    if (!owner) {
      throw new NotFoundException(`Token ${tokenId} not found or has no owner`);
    }

    return {
      tokenId,
      owner,
      mintedAt: new Date().toISOString(),
      collectionId: 'viral-clips',
    };
  }

  /**
   * ERC721-like balance_of() function.
   * Returns the number of NFTs owned by a wallet address.
   * View-only function (no state mutations).
   */
  async balanceOf(walletAddress: string): Promise<NftBalanceResponseDto> {
    const addressCheck = this.stellarService.validateAddress(walletAddress);
    if (!addressCheck.valid) {
      throw new BadRequestException(`Invalid wallet address: ${addressCheck.message}`);
    }

    // Try to query from contract first
    try {
      const { balance, tokenIds } = await this.queryContractBalance(walletAddress);
      if (balance >= 0) {
        return {
          walletAddress,
          balance,
          tokenIds,
        };
      }
    } catch (err) {
      this.logger.warn(`Failed to query contract balance for ${walletAddress}: ${err}`);
    }

    // Fall back to in-memory store
    let balance = 0;
    const tokenIds: string[] = [];

    this.nftOwners.forEach((owner, tokenId) => {
      if (owner === walletAddress) {
        tokenIds.push(tokenId);
        balance++;
      }
    });

    return {
      walletAddress,
      balance,
      tokenIds,
    };
  }

  /**
   * ERC721-like token_uri() function.
   * Returns the metadata URI for a specific NFT token.
   * View-only function (no state mutations).
   */
  async tokenUri(tokenId: string): Promise<NftTokenUriResponseDto> {
    if (!tokenId || isNaN(parseInt(tokenId, 10))) {
      throw new BadRequestException(`Invalid token ID: ${tokenId}`);
    }

    // Try to query from contract first
    try {
      const uri = await this.queryContractTokenUri(tokenId);
      if (uri) {
        return {
          tokenId,
          uri,
          contentType: 'json',
        };
      }
    } catch (err) {
      this.logger.warn(`Failed to query contract token URI for ${tokenId}: ${err}`);
    }

    // Fall back to in-memory store or default
    const uri =
      this.nftMetadataUris.get(tokenId) || `https://clips.cash/metadata/${tokenId}`;

    return {
      tokenId,
      uri,
      contentType: 'json',
    };
  }

  /**
   * Store ClipCash-specific metadata on-chain.
   * Metadata includes virality score, duration, and media URIs.
   */
  async storeClipMetadata(
    tokenId: string,
    metadata: ClipMetadataDto,
  ): Promise<StoreClipMetadataResponseDto> {
    if (!tokenId || isNaN(parseInt(tokenId, 10))) {
      throw new BadRequestException(`Invalid token ID: ${tokenId}`);
    }

    // Validate metadata
    if (metadata.viralityScore < 0 || metadata.viralityScore > 100) {
      throw new BadRequestException('Virality score must be between 0 and 100');
    }

    if (metadata.originalDuration < 0) {
      throw new BadRequestException('Duration must be non-negative');
    }

    // Store metadata in contract (simulated)
    try {
      await this.storeMetadataInContract(tokenId, metadata);
    } catch (err) {
      this.logger.error(`Failed to store metadata: ${err}`);
      throw new InternalServerErrorException('Failed to store metadata on-chain');
    }

    // Store in memory for retrieval
    this.clipMetadata.set(tokenId, metadata);

    const txHash = `metadata_${tokenId}_${Date.now()}`;

    return {
      tokenId,
      stored: true,
      txHash,
      storedAt: new Date().toISOString(),
    };
  }

  /**
   * Retrieve ClipCash metadata for a token.
   */
  async getClipMetadata(tokenId: string): Promise<GetClipMetadataResponseDto> {
    if (!tokenId || isNaN(parseInt(tokenId, 10))) {
      throw new BadRequestException(`Invalid token ID: ${tokenId}`);
    }

    // Try to query from contract first
    try {
      const metadata = await this.queryMetadataFromContract(tokenId);
      if (metadata) {
        return {
          tokenId,
          metadata,
          contractId: this.CONTRACT_ID,
        };
      }
    } catch (err) {
      this.logger.warn(`Failed to query metadata from contract: ${err}`);
    }

    // Fall back to in-memory store
    const metadata = this.clipMetadata.get(tokenId);
    if (!metadata) {
      throw new NotFoundException(`No metadata found for token ${tokenId}`);
    }

    return {
      tokenId,
      metadata,
      contractId: this.CONTRACT_ID,
    };
  }

  /**
   * Set royalty configuration for an NFT.
   * Supports configurable basis points (max 1500 BPS).
   */
  async setRoyalty(
    tokenId: string,
    recipient: string,
    basisPoints: number,
  ): Promise<RoyaltyConfigResponseDto> {
    if (!tokenId || isNaN(parseInt(tokenId, 10))) {
      throw new BadRequestException(`Invalid token ID: ${tokenId}`);
    }

    const addressCheck = this.stellarService.validateAddress(recipient);
    if (!addressCheck.valid) {
      throw new BadRequestException(`Invalid recipient address: ${addressCheck.message}`);
    }

    if (basisPoints < 0 || basisPoints > 10000) {
      throw new BadRequestException('Basis points must be between 0 and 10000');
    }

    if (basisPoints > 1500) {
      throw new BadRequestException(
        `Royalty cannot exceed 1500 BPS (15%), requested: ${basisPoints}`,
      );
    }

    // Store in contract (simulated)
    try {
      await this.storeRoyaltyInContract(tokenId, recipient, basisPoints);
    } catch (err) {
      this.logger.error(`Failed to store royalty: ${err}`);
      throw new InternalServerErrorException('Failed to store royalty on-chain');
    }

    // Store in memory
    const config: RoyaltyConfigResponseDto = {
      tokenId,
      recipient,
      basisPoints,
      percentage: `${(basisPoints / 100).toFixed(2)}%`,
      isPrimary: true,
    };

    if (!this.royaltyConfigs.has(tokenId)) {
      this.royaltyConfigs.set(tokenId, new Map());
    }

    this.royaltyConfigs.get(tokenId)!.set(recipient, config);

    this.logger.log(
      `Set royalty for token ${tokenId}: ${recipient} ${basisPoints} BPS`,
    );

    return config;
  }

  /**
   * Get royalty summary for an NFT.
   * Returns primary and secondary royalty recipients.
   */
  async getRoyaltySummary(tokenId: string): Promise<RoyaltySummaryResponseDto> {
    if (!tokenId || isNaN(parseInt(tokenId, 10))) {
      throw new BadRequestException(`Invalid token ID: ${tokenId}`);
    }

    const configs = this.royaltyConfigs.get(tokenId);
    if (!configs || configs.size === 0) {
      throw new NotFoundException(`No royalty configuration found for token ${tokenId}`);
    }

    const configArray = Array.from(configs.values());
    const primary = configArray[0];
    const secondary = configArray.slice(1);

    const totalBasisPoints = configArray.reduce((sum, cfg) => sum + cfg.basisPoints, 0);

    return {
      tokenId,
      primary,
      secondary,
      totalBasisPoints,
      exceedsMaxRoyalty: totalBasisPoints > 1500,
    };
  }

  /**
   * Private helper: Query owner from Soroban contract.
   */
  private async queryContractOwner(tokenId: string): Promise<string | null> {
    try {
      const result = await this.callViewFunction('owner_of', [
        StellarSdk.nativeToScVal(parseInt(tokenId, 10), { type: 'u32' }),
      ]);

      if (result && typeof result === 'string') {
        return result;
      }
    } catch (err) {
      this.logger.debug(`Contract owner_of failed: ${err}`);
    }

    return null;
  }

  /**
   * Private helper: Query balance from Soroban contract.
   */
  private async queryContractBalance(
    walletAddress: string,
  ): Promise<{ balance: number; tokenIds: string[] }> {
    try {
      const result = await this.callViewFunction('balance_of', [
        StellarSdk.nativeToScVal(walletAddress),
      ]);

      if (typeof result === 'number') {
        return { balance: result, tokenIds: [] };
      }
    } catch (err) {
      this.logger.debug(`Contract balance_of failed: ${err}`);
    }

    return { balance: -1, tokenIds: [] };
  }

  /**
   * Private helper: Query token URI from Soroban contract.
   */
  private async queryContractTokenUri(tokenId: string): Promise<string | null> {
    try {
      const result = await this.callViewFunction('token_uri', [
        StellarSdk.nativeToScVal(parseInt(tokenId, 10), { type: 'u32' }),
      ]);

      if (result && typeof result === 'string') {
        return result;
      }
    } catch (err) {
      this.logger.debug(`Contract token_uri failed: ${err}`);
    }

    return null;
  }

  /**
   * Private helper: Query metadata from Soroban contract.
   */
  private async queryMetadataFromContract(tokenId: string): Promise<ClipMetadataDto | null> {
    try {
      const result = await this.callViewFunction('clip_metadata', [
        StellarSdk.nativeToScVal(parseInt(tokenId, 10), { type: 'u32' }),
      ]);

      // Parse contract response into ClipMetadataDto
      if (result && typeof result === 'object') {
        return result as ClipMetadataDto;
      }
    } catch (err) {
      this.logger.debug(`Contract clip_metadata failed: ${err}`);
    }

    return null;
  }

  /**
   * Private helper: Store metadata in contract.
   */
  private async storeMetadataInContract(
    tokenId: string,
    metadata: ClipMetadataDto,
  ): Promise<void> {
    // In real implementation, this would invoke a contract function
    await Promise.resolve();
  }

  /**
   * Private helper: Store royalty in contract.
   */
  private async storeRoyaltyInContract(
    tokenId: string,
    recipient: string,
    basisPoints: number,
  ): Promise<void> {
    // In real implementation, this would invoke a contract function
    await Promise.resolve();
  }

  /**
   * Private helper: Simulate a contract view call.
   */
  private async callViewFunction(
    fnName: string,
    args: StellarSdk.xdr.ScVal[] = [],
  ): Promise<unknown> {
    const server = new StellarSdk.rpc.Server(this.stellarService.rpcUrl);
    const contract = new StellarSdk.Contract(this.CONTRACT_ID);
    const op = contract.call(fnName, ...args);
    const dummyAccount = new StellarSdk.Account(
      'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN',
      '0',
    );

    const tx = new StellarSdk.TransactionBuilder(dummyAccount, {
      fee: '100',
      networkPassphrase: this.stellarService.networkPassphrase,
    })
      .addOperation(op)
      .setTimeout(StellarSdk.TimeoutInfinite)
      .build();

    try {
      const simulation = await this.circuitBreakerService.execute(
        this.sorobanCircuitBreakerConfig,
        async () => server.simulateTransaction(tx),
      );

      const result = simulation as {
        error?: string;
        results?: Array<{ xdr: string }>;
      };

      if (result.error || !result.results?.[0]?.xdr) {
        throw new Error(result.error || `No return value from ${fnName}()`);
      }

      const returnValue = StellarSdk.xdr.ScVal.fromXDR(
        result.results[0].xdr,
        'base64',
      );

      return StellarSdk.scValToNative(returnValue);
    } catch (err) {
      this.logger.error(`Failed to call ${fnName}(): ${err}`);
      throw err;
    }
  }
}
