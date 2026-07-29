import {
  Injectable,
  Logger,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StellarService } from '../stellar/stellar.service';
import StellarSdk from '@stellar/stellar-sdk';
import { MetricsService } from '../metrics/metrics.service';
import { CircuitBreakerService, CircuitBreakerConfig } from '../common/circuit-breaker/circuit-breaker.service';
import { ConfigService } from '../config/config.service';
import { IpfsUploadService, NftMetadata } from '../nft/ipfs-upload.service';
import { NftOwnershipService } from '../nft/nft-ownership.service';
import { RoyaltyConfigurationService } from '../nft/royalty-configuration.service';

interface NftAttribute {
  trait_type: string;
  value: string | number;
}

interface UploadMetadataResult {
  clipId: number;
  cid: string;
  metadataUri: string;
}

@Injectable()
export class NftMintService {
  private readonly logger = new Logger(NftMintService.name);

  private readonly sorobanCircuitBreakerConfig: CircuitBreakerConfig = {
    name: 'soroban-nft-mint',
    failureThreshold: 5,
    recoveryTimeout: 30000,
    samplingDuration: 60000,
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly stellarService: StellarService,
    private readonly metricsService: MetricsService,
    private readonly circuitBreakerService: CircuitBreakerService,
    private readonly config: ConfigService,
    private readonly ipfsUploadService: IpfsUploadService,
    private readonly nftOwnershipService: NftOwnershipService,
    private readonly royaltyConfigurationService: RoyaltyConfigurationService,
  ) {}

  private get CONTRACT_ID(): string {
    return this.config.sorobanNftContractId || 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEU4';
  }

  async uploadMetadataToIPFS(clipId: number): Promise<UploadMetadataResult> {
    const clip = await this.prisma.clip.findUnique({
      where: { id: clipId },
    });

    if (!clip) {
      throw new NotFoundException(`Clip with ID ${clipId} not found`);
    }

    if (!clip.clipUrl) {
      throw new BadRequestException(
        'Clip is not ready for metadata upload (missing clipUrl)',
      );
    }

    const royaltyBps = this.royaltyConfigurationService.getCreatorRoyaltyBps(
      clip.royaltyBps,
    );
    let royaltyRecipient: string | undefined;
    try {
      royaltyRecipient = this.royaltyConfigurationService.getPlatformWallet();
    } catch {
      royaltyRecipient = undefined;
    }

    const metadata = this.buildMetadata({
      id: clip.id,
      title: clip.title,
      caption: clip.caption,
      clipUrl: clip.clipUrl,
      thumbnail: clip.thumbnail,
      duration: clip.duration,
      viralityScore: clip.viralityScore,
      createdAt: clip.createdAt,
      postStatus: clip.postStatus,
      royaltyBps,
      royaltyRecipient,
    });

    const metadataUri = await this.ipfsUploadService.uploadMetadata(
      metadata,
      clip.id,
    );
    const cid = metadataUri.replace('ipfs://', '');

    await this.prisma.clip.update({
      where: { id: clip.id },
      data: { metadataUri },
    });

    return {
      clipId: clip.id,
      cid,
      metadataUri,
    };
  }

  /**
   * Verify that a clip belongs to the given user before allowing a mint.
   * Throws ForbiddenException if the clip doesn't exist or isn't owned by userId.
   *
   * Performance: Uses select instead of include to fetch only userId (optimization #326)
   */
  async validateClipOwner(clipId: number, userId: number): Promise<void> {
    const clip = await this.prisma.clip.findUnique({
      where: { id: clipId },
      select: {
        id: true,
        video: {
          select: { userId: true },
        },
      },
    });
    if (!clip) {
      throw new NotFoundException(`Clip with ID ${clipId} not found`);
    }
    if (clip.video.userId !== userId) {
      throw new ForbiddenException('You do not own this clip');
    }
  }

  /**
   * Prepares (but does not sign) a Soroban transaction for minting a clip as an NFT.
   * Following OpenZeppelin Soroban NFT template: mint(to: Address, token_id: u128, uri: String)
   *
   * @param clipId - ID of the clip to mint
   * @param walletAddress - Stellar wallet address that will receive the NFT
   * @returns XDR string for the frontend to sign
   */
  async prepareMintTx(clipId: number, walletAddress: string) {
    this.logger.log(
      `Preparing mint transaction for clipId=${clipId}, wallet=${walletAddress}`,
    );

    // Validate Stellar wallet address format
    const addressCheck = this.stellarService.validateAddress(walletAddress);
    if (!addressCheck.valid) {
      throw new BadRequestException(
        `Invalid wallet address: ${addressCheck.message}`,
      );
    }

    // Fetch clip with clipPosts
    const clip = await this.prisma.clip.findUnique({ 
      where: { id: clipId },
      include: { clipPosts: { select: { status: true } } },
    });

    if (!clip) {
      throw new NotFoundException(`Clip with ID ${clipId} not found`);
    }

    // Prevent double minting
    if (clip.nftStatus === 'minting' || clip.nftStatus === 'minted') {
      throw new BadRequestException(
        'Clip is already being minted or has been minted',
      );
    }

    if (clip.mintAddress) {
      throw new BadRequestException('Clip has already been minted on-chain');
    }

    // Prevent minting of posted clips
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

    // Set minting state before blockchain interaction; persist resolved royalty default
    const resolvedRoyaltyBps =
      this.royaltyConfigurationService.getCreatorRoyaltyBps(clip.royaltyBps);

    await this.prisma.clip.update({
      where: { id: clipId },
      data: {
        nftStatus: 'minting',
        royaltyBps: resolvedRoyaltyBps,
      },
    });

    try {
      const metadataUri =
        clip.metadataUri ?? (await this.uploadMetadataToIPFS(clip.id)).metadataUri;

      const networkPassphrase = this.stellarService.networkPassphrase;
      const rpcUrl = this.stellarService.rpcUrl;
      const server = new StellarSdk.rpc.Server(rpcUrl);

      // Load source account to get current sequence number with circuit breaker
      const sourceAccount = await this.circuitBreakerService.execute(
        this.sorobanCircuitBreakerConfig,
        async () => server.getAccount(walletAddress),
      );

      const contract = new StellarSdk.Contract(this.CONTRACT_ID);

      const royaltyMapEntries = this.royaltyConfigurationService.buildRoyaltyMap(
        walletAddress,
        resolvedRoyaltyBps,
      );

      const op = contract.call(
        'mint',
        StellarSdk.Address.fromString(walletAddress).toScVal(),   // to: Address
        StellarSdk.nativeToScVal(BigInt(clip.id), { type: 'u128' }), // token_id: u128
        StellarSdk.nativeToScVal(metadataUri, { type: 'string' }),   // uri: String
        StellarSdk.nativeToScVal(royaltyMapEntries, { type: 'map' }), // royalties: Map<Address, u32>
      );

      const tx = new StellarSdk.TransactionBuilder(sourceAccount, {
        fee: '10000',
        networkPassphrase,
      })
        .addOperation(op)
        .setTimeout(StellarSdk.TimeoutInfinite)
        .build();

      const xdr = tx.toXDR();

      this.logger.log(`Transaction XDR prepared for clip ${clipId}`);

      return {
        xdr,
        clipId: clip.id,
        tokenId: clip.id,
        metadataUri,
        royaltyBps: resolvedRoyaltyBps,
        to: walletAddress,
        contractId: this.CONTRACT_ID,
        network: this.stellarService.network,
      };
    } catch (error) {
      this.metricsService.incrementNftMints('failure');
      // Update status to failed on error
      await this.prisma.clip.update({
        where: { id: clipId },
        data: { nftStatus: 'failed' },
      });

      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }

      // Pass through ServiceUnavailableException from circuit breaker
      if (error.name === 'ServiceUnavailableException') {
        this.logger.error(`Soroban service unavailable during mint preparation: ${error.message}`);
        throw error;
      }

      const message =
        error instanceof Error ? error.message : 'unknown minting error';
      const stack = error instanceof Error ? error.stack : undefined;
      this.logger.error(
        `Failed to prepare mint transaction: ${message}`,
        stack,
      );
      throw new BadRequestException(
        `Stellar transaction preparation failed: ${message}`,
      );
    }
  }

  private buildMetadata(clip: {
    id: number;
    title: string | null;
    caption: string | null;
    clipUrl: string;
    thumbnail: string | null;
    duration: number;
    viralityScore: number | null;
    createdAt: Date;
    postStatus: unknown;
    royaltyBps: number;
    royaltyRecipient?: string | null;
  }): NftMetadata {
    const platforms = this.extractPlatforms(clip.postStatus);
    const viralityScore = clip.viralityScore ?? 0;
    const royaltyRecipient = clip.royaltyRecipient?.trim() || undefined;

    const asset = this.royaltyConfigurationService.getRoyaltyAsset();

    const attributes: NftAttribute[] = [
      { trait_type: 'Clip Duration', value: clip.duration },
      { trait_type: 'Virality Score', value: viralityScore },
      { trait_type: 'Creation Date', value: clip.createdAt.toISOString() },
      { trait_type: 'Royalty BPS', value: clip.royaltyBps },
      { trait_type: 'Royalty Percent', value: clip.royaltyBps / 100 },
      { trait_type: 'Platforms Posted To', value: platforms.join(', ') },
    ];

    return {
      name: clip.title?.trim() || `Clip #${clip.id}`,
      description: clip.caption?.trim() || `Generated clip ${clip.id}`,
      image: clip.thumbnail || clip.clipUrl,
      animation_url: clip.clipUrl,
      attributes,
      seller_fee_basis_points: clip.royaltyBps,
      ...(royaltyRecipient ? { fee_recipient: royaltyRecipient } : {}),
      royalty: {
        bps: clip.royaltyBps,
        percent: clip.royaltyBps / 100,
        ...(royaltyRecipient ? { recipient: royaltyRecipient } : {}),
        asset: asset.code,
        ...(asset.contractId ? { assetContractId: asset.contractId } : {}),
      },
    };
  }

  private extractPlatforms(postStatus: unknown): string[] {
    if (!postStatus || typeof postStatus !== 'object') {
      return [];
    }

    if (Array.isArray(postStatus)) {
      return postStatus.filter((v): v is string => typeof v === 'string');
    }

    return Object.entries(postStatus as Record<string, unknown>)
      .filter(([, value]) => Boolean(value))
      .map(([platform]) => platform);
  }

  /**
   * Confirm successful minting after on-chain transaction submission.
   * Updates the Clip to 'minted' status with contract details.
   */
  async confirmMint(
    clipId: number,
    contractId: string,
  ): Promise<{ success: boolean; clip?: { id: number; mintAddress: string | null; nftStatus: string } }> {
    this.logger.log(`Confirming mint for clip ${clipId} with contract ${contractId}`);

    try {
      const existingClip = await this.prisma.clip.findUnique({
        where: { id: clipId },
        select: { nftStatus: true, mintAddress: true },
      });

      if (!existingClip) {
        throw new NotFoundException(`Clip with ID ${clipId} not found`);
      }

      if (existingClip.nftStatus === 'minted' || existingClip.mintAddress) {
        throw new BadRequestException('Clip has already been minted on-chain');
      }

      const clip = await this.prisma.clip.update({
        where: { id: clipId },
        data: {
          nftStatus: 'minted',
          mintAddress: contractId,
          mintedAt: new Date(),
        },
      });
      this.metricsService.incrementNftMints('success');

      return {
        success: true,
        clip: {
          id: clip.id,
          mintAddress: clip.mintAddress,
          nftStatus: clip.nftStatus,
        },
      };
    } catch (error) {
      this.metricsService.incrementNftMints('failure');
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to confirm mint for clip ${clipId}: ${message}`);
      throw new BadRequestException(`Failed to confirm mint: ${message}`);
    }
  }

  /**
   * Verified on-chain NFT ownership for a specific token and wallet.
   * Query Soroban contract 'owner_of' and compare with walletAddress.
   */
  async verifyNFTOwnership(
    tokenId: string,
    walletAddress: string,
  ): Promise<{
    owned: boolean;
    error?: string;
  }> {
    const result = await this.nftOwnershipService.verifyNFTOwnership(
      tokenId,
      walletAddress,
    );
    return {
      owned: result.isOwner,
      error: result.error,
    };
  }

  /**
   * Prepare an unsigned Soroban `transfer_with_royalty` transaction XDR.
   *
   * Resolves the applicable royalty rate (per-token > contract default > 0),
   * computes the royalty amount, and builds the XDR for the frontend to sign.
   *
   * @param tokenId          - NFT token ID (= clip.id) being transferred
   * @param fromWallet       - Current owner's Stellar wallet address
   * @param toWallet         - Recipient's Stellar wallet address
   * @param salePrice        - Agreed sale price in stroops (pass 0 for gifts)
   * @param royaltyBpsOverride - Optional caller-supplied royalty rate (0–10 000)
   */
  async prepareTransferTx(
    tokenId: number,
    fromWallet: string,
    toWallet: string,
    salePrice: number,
    royaltyBpsOverride?: number,
  ): Promise<{
    xdr: string;
    tokenId: number;
    fromWallet: string;
    toWallet: string;
    salePrice: number;
    royaltyBreakdown: {
      royaltyBps: number;
      royaltyAmount: number;
      royaltyPercent: number;
      recipient: string | null;
    };
    contractId: string;
    network: string;
  }> {
    this.logger.log(
      `Preparing transfer_with_royalty XDR: tokenId=${tokenId}, ` +
      `from=${fromWallet}, to=${toWallet}, salePrice=${salePrice}`,
    );

    // Validate wallet addresses
    const fromCheck = this.stellarService.validateAddress(fromWallet);
    if (!fromCheck.valid) {
      throw new BadRequestException(`Invalid fromWallet: ${fromCheck.message}`);
    }
    const toCheck = this.stellarService.validateAddress(toWallet);
    if (!toCheck.valid) {
      throw new BadRequestException(`Invalid toWallet: ${toCheck.message}`);
    }

    // Validate royalty override if provided
    if (royaltyBpsOverride !== undefined) {
      if (!Number.isInteger(royaltyBpsOverride) || royaltyBpsOverride < 0 || royaltyBpsOverride > 10_000) {
        throw new BadRequestException(
          `royaltyBpsOverride must be an integer between 0 and 10 000, got ${royaltyBpsOverride}`,
        );
      }
    }

    // Resolve royalty BPS: override > config default > 0
    const royaltyBps =
      royaltyBpsOverride ??
      this.royaltyConfigurationService.getCreatorRoyaltyBps(undefined);

    // Compute royalty amount (integer division, rounded down)
    const royaltyAmount =
      salePrice > 0 && royaltyBps > 0
        ? Math.floor((salePrice * royaltyBps) / 10_000)
        : 0;

    const royaltyPercent = royaltyBps / 100;

    // Resolve royalty recipient (platform wallet as fallback)
    let royaltyRecipient: string | null = null;
    try {
      royaltyRecipient = this.royaltyConfigurationService.getPlatformWallet() ?? null;
    } catch {
      royaltyRecipient = null;
    }

    try {
      const networkPassphrase = this.stellarService.networkPassphrase;
      const rpcUrl = this.stellarService.rpcUrl;
      const server = new StellarSdk.rpc.Server(rpcUrl);

      const sourceAccount = await this.circuitBreakerService.execute(
        this.sorobanCircuitBreakerConfig,
        async () => server.getAccount(fromWallet),
      );

      const contract = new StellarSdk.Contract(this.CONTRACT_ID);

      const op = contract.call(
        'transfer_with_royalty',
        StellarSdk.Address.fromString(fromWallet).toScVal(),          // from: Address
        StellarSdk.Address.fromString(toWallet).toScVal(),            // to: Address
        StellarSdk.nativeToScVal(BigInt(tokenId), { type: 'u64' }),   // token_id: u64
        StellarSdk.nativeToScVal(BigInt(salePrice), { type: 'u64' }), // sale_price: u64
      );

      const tx = new StellarSdk.TransactionBuilder(sourceAccount, {
        fee: '10000',
        networkPassphrase,
      })
        .addOperation(op)
        .setTimeout(StellarSdk.TimeoutInfinite)
        .build();

      const xdr = tx.toXDR();

      this.logger.log(`Transfer XDR prepared for tokenId=${tokenId}`);

      return {
        xdr,
        tokenId,
        fromWallet,
        toWallet,
        salePrice,
        royaltyBreakdown: {
          royaltyBps,
          royaltyAmount,
          royaltyPercent,
          recipient: royaltyRecipient,
        },
        contractId: this.CONTRACT_ID,
        network: this.stellarService.network,
      };
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }
      if (error?.name === 'ServiceUnavailableException') {
        this.logger.error(`Soroban service unavailable during transfer preparation: ${error.message}`);
        throw error;
      }
      const message = error instanceof Error ? error.message : 'unknown error';
      this.logger.error(`Failed to prepare transfer XDR: ${message}`);
      throw new BadRequestException(
        `Stellar transfer preparation failed: ${message}`,
      );
    }
  }
}
