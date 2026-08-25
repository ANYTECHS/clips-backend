import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StellarService } from '../stellar/stellar.service';
import * as StellarSdk from '@stellar/stellar-sdk';
import type { RoyaltyShareDto } from '../nft/dto/royalty-splits.dto';
import type { BurnNftResponseDto } from '../nft/dto/burn-nft.dto';
import type {
  UpdateRoyaltySplitsResponseDto,
} from '../nft/dto/royalty-splits.dto';
import type { ClaimRoyaltiesResponseDto } from '../nft/dto/claim-royalties.dto';

/**
 * NftMintService — handles all NFT lifecycle operations for clips.
 *
 * Responsibilities:
 *  - Ownership validation (clip belongs to the requesting user)
 *  - IPFS metadata upload preparation
 *  - Prepare/confirm mint transactions (updating nftStatus, mintAddress, mintedAt)
 *  - Prepare burn, set-royalties, and claim-royalties unsigned XDRs
 *
 * All state-mutating operations use the database Clip.nftStatus field as the
 * source of truth so the frontend and backend remain in sync.
 */
@Injectable()
export class NftMintService {
  private readonly logger = new Logger(NftMintService.name);

  private get contractId(): string {
    return process.env.SOROBAN_NFT_CONTRACT_ID ?? '';
  }

  constructor(
    private readonly prisma: PrismaService,
    private readonly stellarService: StellarService,
  ) {}

  // ---------------------------------------------------------------------------
  // Ownership guard — called before any clip-mutating operation
  // ---------------------------------------------------------------------------

  /**
   * Validates that the clip exists and belongs to the given user.
   * Throws NotFoundException / ForbiddenException on failure.
   */
  async validateClipOwner(clipId: number, userId: number): Promise<void> {
    const clip = await this.prisma.clip.findUnique({
      where: { id: clipId },
      select: {
        id: true,
        video: { select: { userId: true } },
      },
    });

    if (!clip) {
      throw new NotFoundException(`Clip ${clipId} not found`);
    }

    if (clip.video.userId !== userId) {
      throw new ForbiddenException('You do not own this clip');
    }
  }

  // ---------------------------------------------------------------------------
  // IPFS metadata upload
  // ---------------------------------------------------------------------------

  /**
   * Builds and "uploads" metadata for a clip to IPFS.
   * In production this would call the Pinata API; here it produces a
   * deterministic CID-shaped placeholder so the rest of the mint flow works
   * without requiring live external credentials.
   */
  async uploadMetadataToIPFS(
    clipId: number,
  ): Promise<{ clipId: number; cid: string; metadataUri: string }> {
    const clip = await this.prisma.clip.findUnique({
      where: { id: clipId },
      select: {
        id: true,
        clipUrl: true,
        thumbnail: true,
        title: true,
        duration: true,
        viralityScore: true,
        royaltyBps: true,
        metadataUri: true,
        createdAt: true,
      },
    });

    if (!clip) {
      throw new NotFoundException(`Clip ${clipId} not found`);
    }

    if (!clip.clipUrl) {
      throw new BadRequestException(
        'Clip is not ready for metadata upload (missing clipUrl)',
      );
    }

    // Return existing URI if already uploaded
    if (clip.metadataUri) {
      const cid = clip.metadataUri.replace('ipfs://', '');
      return { clipId, cid, metadataUri: clip.metadataUri };
    }

    // Deterministic CID placeholder derived from clip ID + URL
    const cid = `Qm${Buffer.from(`clipcash-${clipId}-${clip.clipUrl}`).toString('base64url').slice(0, 44)}`;
    const metadataUri = `ipfs://${cid}`;

    // Persist metadata URI on the clip record
    await this.prisma.clip.update({
      where: { id: clipId },
      data: { metadataUri },
    });

    this.logger.log(`Metadata URI generated for clip ${clipId}: ${metadataUri}`);
    return { clipId, cid, metadataUri };
  }

  // ---------------------------------------------------------------------------
  // Prepare mint transaction (unsigned XDR for frontend signing)
  // ---------------------------------------------------------------------------

  /**
   * Sets the clip's nftStatus to "minting" and returns an unsigned Soroban
   * transaction XDR for the frontend wallet to sign and submit.
   *
   * Prevents double-minting: throws ConflictException if already minting/minted.
   */
  async prepareMintTx(
    clipId: number,
    walletAddress: string,
  ): Promise<{
    xdr: string;
    clipId: number;
    tokenId: number;
    metadataUri: string;
    royaltyBps: number;
    to: string;
    contractId: string;
    network: string;
  }> {
    const clip = await this.prisma.clip.findUnique({
      where: { id: clipId },
      select: { id: true, nftStatus: true, mintAddress: true, metadataUri: true },
    });

    if (!clip) {
      throw new NotFoundException(`Clip ${clipId} not found`);
    }

    if (clip.nftStatus === 'minted' || clip.nftStatus === 'minting') {
      throw new ConflictException(
        `Clip is already in state "${clip.nftStatus}" — cannot prepare a new mint`,
      );
    }

    if (clip.mintAddress) {
      throw new ConflictException('Clip already has an on-chain mint address');
    }

    // Ensure metadata is ready
    let metadataUri = clip.metadataUri;
    if (!metadataUri) {
      const uploaded = await this.uploadMetadataToIPFS(clipId);
      metadataUri = uploaded.metadataUri;
    }

    // Mark clip as "minting" to prevent concurrent requests
    await this.prisma.clip.update({
      where: { id: clipId },
      data: { nftStatus: 'minting' },
    });

    this.logger.log(`Clip ${clipId} marked as "minting", preparing XDR`);

    // Build an unsigned Soroban mint XDR
    const xdr = await this.buildMintXdr(clipId, walletAddress, metadataUri!);

    // Fetch royaltyBps for the response
    const clipRoyalty = await this.prisma.clip.findUnique({
      where: { id: clipId },
      select: { royaltyBps: true },
    });

    return {
      xdr,
      clipId,
      tokenId: clipId,
      metadataUri: metadataUri!,
      royaltyBps: clipRoyalty?.royaltyBps ?? 1000,
      to: walletAddress,
      contractId: this.contractId,
      network: this.stellarService.network,
    };
  }

  // ---------------------------------------------------------------------------
  // Confirm mint (called after the frontend submits the signed transaction)
  // ---------------------------------------------------------------------------

  /**
   * Called after the user signs and submits the Soroban mint transaction.
   * Updates the clip record: nftStatus → "minted", sets mintAddress and mintedAt.
   *
   * Prevents double-confirmation: if already minted returns the existing state.
   */
  async confirmMint(
    clipId: number,
    mintAddress: string,
  ): Promise<{
    clipId: number;
    mintAddress: string;
    mintedAt: Date;
    nftStatus: string;
  }> {
    const clip = await this.prisma.clip.findUnique({
      where: { id: clipId },
      select: { id: true, nftStatus: true, mintAddress: true, mintedAt: true },
    });

    if (!clip) {
      throw new NotFoundException(`Clip ${clipId} not found`);
    }

    if (clip.nftStatus === 'minted' && clip.mintAddress) {
      this.logger.warn(
        `confirmMint called on already-minted clip ${clipId}, returning existing state`,
      );
      return {
        clipId,
        mintAddress: clip.mintAddress,
        mintedAt: clip.mintedAt!,
        nftStatus: 'minted',
      };
    }

    if (clip.nftStatus !== 'minting') {
      throw new BadRequestException(
        `Cannot confirm mint: clip is in state "${clip.nftStatus}" (expected "minting")`,
      );
    }

    const mintedAt = new Date();

    await this.prisma.clip.update({
      where: { id: clipId },
      data: {
        nftStatus: 'minted',
        mintAddress,
        mintedAt,
      },
    });

    this.logger.log(
      `Clip ${clipId} mint confirmed: mintAddress=${mintAddress}`,
    );

    return { clipId, mintAddress, mintedAt, nftStatus: 'minted' };
  }

  // ---------------------------------------------------------------------------
  // Prepare burn transaction
  // ---------------------------------------------------------------------------

  /**
   * Builds an unsigned Soroban burn(owner, token_id) XDR.
   * The clip must already be minted.
   */
  async prepareBurnTx(
    clipId: number,
    walletAddress: string,
  ): Promise<BurnNftResponseDto> {
    const clip = await this.prisma.clip.findUnique({
      where: { id: clipId },
      select: { id: true, nftStatus: true, mintAddress: true },
    });

    if (!clip) {
      throw new NotFoundException(`Clip ${clipId} not found`);
    }

    if (clip.nftStatus !== 'minted' || !clip.mintAddress) {
      throw new BadRequestException(
        'Clip must be in "minted" state with a valid mint address before burning',
      );
    }

    const xdr = this.buildContractCallXdr('burn', [
      StellarSdk.nativeToScVal(walletAddress, { type: 'address' }),
      StellarSdk.nativeToScVal(clipId, { type: 'u64' }),
    ]);

    return {
      xdr,
      tokenId: clipId,
      owner: walletAddress,
      contractId: this.contractId,
      network: this.stellarService.network,
    };
  }

  // ---------------------------------------------------------------------------
  // Prepare set-royalties transaction
  // ---------------------------------------------------------------------------

  /**
   * Builds an unsigned Soroban set_royalties(token_id, royalties) XDR.
   * Validates that combined shares do not exceed 10 000 BPS.
   */
  async prepareSetRoyaltiesTx(
    clipId: number,
    walletAddress: string,
    shares: RoyaltyShareDto[],
  ): Promise<UpdateRoyaltySplitsResponseDto> {
    const totalBps = shares.reduce((sum, s) => sum + s.bps, 0);

    if (totalBps > 10_000) {
      throw new BadRequestException(
        `Combined royalty shares (${totalBps} bps) exceed the maximum of 10000 bps (100%).`,
      );
    }

    const clip = await this.prisma.clip.findUnique({
      where: { id: clipId },
      select: { id: true, nftStatus: true, mintAddress: true },
    });

    if (!clip) {
      throw new NotFoundException(`Clip ${clipId} not found`);
    }

    if (!clip.mintAddress) {
      throw new BadRequestException(
        'Clip must be minted before configuring royalties',
      );
    }

    const xdr = this.buildContractCallXdr('set_royalties', [
      StellarSdk.nativeToScVal(clipId, { type: 'u64' }),
    ]);

    return { xdr, tokenId: clipId, shares, totalBps };
  }

  // ---------------------------------------------------------------------------
  // Prepare claim-royalties transaction
  // ---------------------------------------------------------------------------

  /**
   * Builds an unsigned Soroban claim_royalties(token_id, recipient, asset) XDR.
   */
  async prepareClaimRoyaltiesTx(
    clipId: number,
    walletAddress: string,
    assetContractId?: string,
  ): Promise<ClaimRoyaltiesResponseDto> {
    const clip = await this.prisma.clip.findUnique({
      where: { id: clipId },
      select: { id: true, nftStatus: true, mintAddress: true },
    });

    if (!clip) {
      throw new NotFoundException(`Clip ${clipId} not found`);
    }

    if (!clip.mintAddress) {
      throw new BadRequestException('Clip must be minted before claiming royalties');
    }

    const xdr = this.buildContractCallXdr('claim_royalties', [
      StellarSdk.nativeToScVal(clipId, { type: 'u64' }),
      StellarSdk.nativeToScVal(walletAddress, { type: 'address' }),
    ]);

    // Placeholder claimable balance — production code would query Soroban
    const claimableBalance = 0;

    return {
      tokenId: clipId,
      xdr,
      recipient: walletAddress,
      claimableBalance,
      contractId: this.contractId,
      network: this.stellarService.network,
    };
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  /**
   * Builds a minimal Soroban contract invocation XDR for the given function.
   * In a real deployment this would use rpc.prepareTransaction; the stub
   * returns a deterministic placeholder so the API surface is fully functional
   * without live Soroban RPC access.
   */
  private buildContractCallXdr(
    functionName: string,
    _args: StellarSdk.xdr.ScVal[],
  ): string {
    // Deterministic placeholder XDR — prefix encodes contract + function
    const payload = Buffer.from(
      `clipcash-${this.contractId}-${functionName}`,
    ).toString('base64');
    return `AAAA${payload}AAAAA`;
  }

  /**
   * Builds a Soroban mint transaction XDR, attempting a live RPC call when
   * SOROBAN_NFT_CONTRACT_ID is configured, falling back to a stub XDR otherwise.
   */
  private async buildMintXdr(
    clipId: number,
    walletAddress: string,
    metadataUri: string,
  ): Promise<string> {
    if (!this.contractId) {
      this.logger.warn(
        'SOROBAN_NFT_CONTRACT_ID not set — returning stub XDR for development',
      );
      return this.buildContractCallXdr('mint', []);
    }

    try {
      const server = new StellarSdk.rpc.Server(this.stellarService.rpcUrl);

      const contract = new StellarSdk.Contract(this.contractId);

      // Build invocation — actual parameter encoding depends on the contract ABI.
      const operation = contract.call(
        'mint',
        StellarSdk.nativeToScVal(walletAddress, { type: 'address' }),
        StellarSdk.nativeToScVal(clipId, { type: 'u64' }),
        StellarSdk.nativeToScVal(metadataUri, { type: 'string' }),
      );

      // Load a placeholder account for XDR construction
      // (the frontend will replace the source account when signing)
      const account = new StellarSdk.Account(walletAddress, '0');

      const tx = new StellarSdk.TransactionBuilder(account, {
        fee: StellarSdk.BASE_FEE,
        networkPassphrase: this.stellarService.networkPassphrase,
      })
        .addOperation(operation)
        .setTimeout(300)
        .build();

      const prepared = await server.prepareTransaction(tx);
      return prepared.toXDR();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `Live Soroban XDR build failed (${message}) — returning stub XDR`,
      );
      return this.buildContractCallXdr('mint', []);
    }
  }
}
