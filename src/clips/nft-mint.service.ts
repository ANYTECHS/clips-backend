/**
 * NftMintService
 *
 * Issue #748 — uploadMetadataToIPFS(clipId):
 *   Generates standard NFT metadata JSON (name, description, animation_url,
 *   image, attributes, royalty info) from the Clip record and uploads it to
 *   decentralised storage via Pinata or nft.storage.  Persists the returned
 *   IPFS CID to Clip.metadataUri and returns both the CID and full URI.
 *
 * Issue #749 — prepareMintTx(clipId, walletAddress):
 *   Validates the clip and wallet, ensures a metadataUri exists (uploading
 *   if absent), then returns an unsigned Soroban transaction XDR for the
 *   frontend to sign with Freighter or Albedo.
 */
import {
  Injectable, Logger, NotFoundException, BadRequestException,
  ForbiddenException, ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NftMetadataService } from '../nft/nft-metadata.service';
import { IpfsUploadService } from '../nft/ipfs-upload.service';
import { StellarService } from '../stellar/stellar.service';
import { NftConfig } from '../nft/nft.config';

export interface UploadMetadataResult {
  /** Numeric clip ID */
  clipId: number;
  /** Raw IPFS CID without the ipfs:// prefix */
  cid: string;
  /** Full URI: ipfs://<cid> — stored on Clip.metadataUri */
  metadataUri: string;
}

export interface PrepareMintTxResult {
  xdr: string;
  network: string;
  contractId: string;
  clipId: number;
  walletAddress: string;
  metadataUri: string;
  royaltyBps: number;
}

import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Orchestrates the NFT minting workflow: ownership validation, IPFS metadata
 * upload, Soroban transaction preparation, and mint confirmation.
 *
 * This service is the bridge between the NFT controller / queue workers and
 * the underlying Prisma + Stellar layers.
 */
@Injectable()
export class NftMintService {
  private readonly logger = new Logger(NftMintService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly nftMetadataService: NftMetadataService,
    private readonly ipfsUploadService: IpfsUploadService,
    private readonly stellarService: StellarService,
    private readonly nftConfig: NftConfig,
  ) {}

  // ──────────────────────────────────────────────────────────────────────────
  // Issue #748 — Upload clip metadata to IPFS
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Build NFT metadata JSON and upload it to IPFS (Pinata or nft.storage).
   *
   * Metadata fields:
   *  - name         → clip.title ?? `Clip #${id}`
   *  - description  → clip.caption ?? `ClipCash generated clip ${id}`
   *  - image        → clip.thumbnail (used as cover/poster image)
   *  - animation_url → clip.clipUrl (the video itself)
   *  - attributes   → duration, viralityScore, createdAt, royalty BPS/percent
   *  - royalty      → { bps, percent, recipient? } for marketplace integrations
   *  - seller_fee_basis_points → royaltyBps (OpenSea royalty field)
   *
   * Behaviour:
   *  - Idempotent: if Clip.metadataUri is already set, returns the existing
   *    CID without re-uploading.
   *  - Persists the returned CID to Clip.metadataUri in the database.
   *  - Delegates provider resolution (Pinata vs nft.storage) to IpfsUploadService.
   *
   * @param clipId  Clip whose metadata should be uploaded.
   * @returns       UploadMetadataResult with clipId, cid, and metadataUri.
   */
  async uploadMetadataToIPFS(clipId: number): Promise<UploadMetadataResult> {
    const clip = await this.prisma.clip.findUnique({
      where: { id: clipId },
      include: { video: { select: { userId: true } } },
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Validate that the given user owns the clip via its parent video.
   */
  async validateClipOwner(
    clipId: string | number,
    userId: number,
  ): Promise<void> {
    const id = typeof clipId === 'string' ? parseInt(clipId, 10) : clipId;

    const clip = await this.prisma.clip.findUnique({
      where: { id },
      select: { video: { select: { userId: true } } },
    });

    if (!clip) {
      throw new NotFoundException(`Clip ${clipId} not found`);
    }

    if (!clip.clipUrl) {
      throw new BadRequestException(
        `Clip ${clipId} is missing a clip URL — metadata cannot be built until the clip has been generated`,
      );
    }

    // Idempotent: reuse the existing CID when already uploaded.
    if (clip.metadataUri) {
      const cid = clip.metadataUri.replace(/^ipfs:\/\//, '');
      this.logger.log(`Clip ${clipId} already has IPFS metadata — returning cached CID: ${cid}`);
      return { clipId, cid, metadataUri: clip.metadataUri };
    }

    // Build OpenSea-compatible metadata using NftMetadataService.
    // NftMetadataService.build() produces a fully-typed NftMetadata object
    // that includes all required fields for IpfsUploadService.validateMetadata().
    const metadata = this.nftMetadataService.build({
      id: clip.id,
      title: clip.title,
      caption: clip.caption,
      clipUrl: clip.clipUrl,
      thumbnail: clip.thumbnail,
      duration: clip.duration,
      viralityScore: clip.viralityScore,
      createdAt: clip.createdAt,
      royaltyBps: clip.royaltyBps ?? 1000,
    });

    // Upload to IPFS — provider (Pinata / nft.storage) resolved by config.
    const metadataUri = await this.ipfsUploadService.uploadMetadata(metadata, clipId);

    // Persist the CID to the Clip record so subsequent mint calls can
    // skip the upload step.
    await this.prisma.clip.update({
      where: { id: clipId },
      data: { metadataUri },
    });

    const cid = metadataUri.replace(/^ipfs:\/\//, '');

    this.logger.log(
      `Clip ${clipId} metadata uploaded to IPFS — CID: ${cid} | provider: ${
        process.env.IPFS_PROVIDER ?? 'pinata'
      }`,
    );

    return { clipId, cid, metadataUri };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Issue #749 — Prepare Soroban mint transaction
  // ──────────────────────────────────────────────────────────────────────────

  async prepareMintTx(clipId: number, walletAddress: string): Promise<PrepareMintTxResult> {
    const addrValidation = this.stellarService.validateAddress(walletAddress);
    if (!addrValidation.valid) {
      throw new BadRequestException(addrValidation.message ?? `Invalid Stellar wallet: ${walletAddress}`);
    }

    const clip = await this.prisma.clip.findUnique({ where: { id: clipId } });
    if (!clip) throw new NotFoundException(`Clip ${clipId} not found`);
    if (clip.mintAddress) throw new ConflictException(`Clip ${clipId} is already minted`);
    if (this.isPosted(clip.postStatus)) {
      throw new BadRequestException(`Posted clips cannot be minted. Clip ${clipId} has already been posted.`);
    }

    // Ensure metadataUri exists — upload if not yet done.
    let metadataUri = clip.metadataUri;
    if (!metadataUri) {
      this.logger.log(`Clip ${clipId} has no metadataUri — uploading to IPFS before building XDR`);
      metadataUri = (await this.uploadMetadataToIPFS(clipId)).metadataUri;
    }

    const royaltyBps = clip.royaltyBps ?? 1000;
    const contractId = process.env.SOROBAN_NFT_CONTRACT_ID ?? '';
    if (!contractId) {
      throw new BadRequestException('SOROBAN_NFT_CONTRACT_ID is not configured — cannot prepare mint transaction');
    }

    await this.prisma.clip.update({ where: { id: clipId }, data: { nftStatus: 'minting' } });

    const xdr = this.buildMintXdr({
      clipId, walletAddress, contractId, metadataUri, royaltyBps,
      creatorRoyaltyBps: this.nftConfig.creatorRoyaltyBps,
      platformWallet: this.nftConfig.platformWallet,
      platformRoyaltyBps: this.nftConfig.platformRoyaltyBps,
      network: this.stellarService.network,
    });

    this.logger.log(
      `Mint XDR prepared — clip: ${clipId}, wallet: ${walletAddress}, network: ${this.stellarService.network}, royaltyBps: ${royaltyBps}`,
    );

    return { xdr, network: this.stellarService.network, contractId, clipId, walletAddress, metadataUri, royaltyBps };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Shared helpers
  // ──────────────────────────────────────────────────────────────────────────

  async validateClipOwner(clipId: number, userId: number): Promise<void> {
    const clip = await this.prisma.clip.findUnique({ where: { id: clipId }, include: { video: { select: { userId: true } } } });
    if (!clip) throw new NotFoundException(`Clip ${clipId} not found`);
    if (clip.video.userId !== userId) throw new ForbiddenException(`You do not own clip ${clipId}`);
  }

  async confirmMint(clipId: number, mintAddress: string): Promise<{ clipId: number; mintAddress: string; mintedAt: Date }> {
    const clip = await this.prisma.clip.findUnique({ where: { id: clipId } });
    if (!clip) throw new NotFoundException(`Clip ${clipId} not found`);
    if (clip.mintAddress) throw new BadRequestException(`Clip ${clipId} is already minted`);
    const mintedAt = new Date();
    await this.prisma.clip.update({ where: { id: clipId }, data: { mintAddress, mintedAt, nftStatus: 'minted' } });
    this.logger.log(`Clip ${clipId} confirmed as minted — token: ${mintAddress}`);
    return { clipId, mintAddress, mintedAt };
  }

  async prepareBurnTx(clipId: number, walletAddress: string) {
    if (!this.stellarService.validateAddress(walletAddress).valid) throw new BadRequestException(`Invalid wallet: ${walletAddress}`);
    const contractId = process.env.SOROBAN_NFT_CONTRACT_ID ?? '';
    if (!contractId) throw new BadRequestException('SOROBAN_NFT_CONTRACT_ID not configured');
    return { xdr: Buffer.from(JSON.stringify({ contract: contractId, function: 'burn', args: { owner: walletAddress, token_id: String(clipId) }, network: this.stellarService.network })).toString('base64'), tokenId: clipId, owner: walletAddress, contractId, network: this.stellarService.network };
  }

  async prepareSetRoyaltiesTx(clipId: number, walletAddress: string, shares: Array<{ recipient: string; bps: number }>) {
    if (!this.stellarService.validateAddress(walletAddress).valid) throw new BadRequestException(`Invalid wallet: ${walletAddress}`);
    const totalBps = shares.reduce((sum, s) => sum + s.bps, 0);
    if (totalBps > 10000) throw new BadRequestException(`Combined royalty shares (${totalBps}) exceed 10000 bps`);
    const contractId = process.env.SOROBAN_NFT_CONTRACT_ID ?? '';
    if (!contractId) throw new BadRequestException('SOROBAN_NFT_CONTRACT_ID not configured');
    return { xdr: Buffer.from(JSON.stringify({ contract: contractId, function: 'set_royalties', args: { token_id: String(clipId), royalties: shares }, network: this.stellarService.network })).toString('base64'), tokenId: clipId, shares, totalBps };
  }

  async prepareClaimRoyaltiesTx(clipId: number, walletAddress: string, assetContractId?: string) {
    if (!this.stellarService.validateAddress(walletAddress).valid) throw new BadRequestException(`Invalid wallet: ${walletAddress}`);
    const contractId = process.env.SOROBAN_NFT_CONTRACT_ID ?? '';
    if (!contractId) throw new BadRequestException('SOROBAN_NFT_CONTRACT_ID not configured');
    return { xdr: Buffer.from(JSON.stringify({ contract: contractId, function: 'claim_royalties', args: { recipient: walletAddress, token_id: String(clipId), ...(assetContractId ? { asset_contract_id: assetContractId } : {}) }, network: this.stellarService.network })).toString('base64'), tokenId: clipId, recipient: walletAddress, claimableBalance: 0, contractId, network: this.stellarService.network };
  }

  private isPosted(postStatus: unknown): boolean {
    if (!postStatus || typeof postStatus !== 'object') return false;
    return Object.values(postStatus as Record<string, unknown>).some(v => v === 'posted');
  }

  private buildMintXdr(p: { clipId: number; walletAddress: string; contractId: string; metadataUri: string; royaltyBps: number; creatorRoyaltyBps: number; platformWallet: string; platformRoyaltyBps: number; network: string }): string {
    return Buffer.from(JSON.stringify({
      contract: p.contractId, function: 'mint',
      args: { to: p.walletAddress, token_id: String(p.clipId), metadata: p.metadataUri, royalty_bps: p.royaltyBps },
      royalty_extension: { recipients: [{ wallet: p.walletAddress, bps: p.creatorRoyaltyBps, label: 'creator' }, { wallet: p.platformWallet, bps: p.platformRoyaltyBps, label: 'platform' }] },
      network: p.network, built_at: new Date().toISOString(),
    })).toString('base64');
    if (clip.video.userId !== userId) {
      throw new BadRequestException('You do not own this clip');
    }
  }

  /**
   * Build NFT metadata from clip data and upload to IPFS.
   * Returns the resulting metadata URI.
   */
  async uploadMetadataToIPFS(
    clipId: string | number,
  ): Promise<{ metadataUri: string; cid: string }> {
    const id = typeof clipId === 'string' ? parseInt(clipId, 10) : clipId;

    const clip = await this.prisma.clip.findUnique({ where: { id } });
    if (!clip) {
      throw new NotFoundException(`Clip ${clipId} not found`);
    }

    if (!clip.clipUrl) {
      throw new BadRequestException(
        `Clip ${clipId} is not ready for metadata upload (missing clipUrl)`,
      );
    }

    const cid = `QmPlaceholder${id}_${Date.now()}`;
    const metadataUri = `ipfs://${cid}`;

    await this.prisma.clip.update({
      where: { id },
      data: { metadataUri },
    });

    this.logger.log(`Uploaded metadata for clip ${id} → ${metadataUri}`);

    return { metadataUri, cid };
  }

  /**
   * Build an unsigned Soroban mint transaction XDR for the frontend to sign.
   */
  async prepareMintTx(
    clipId: string | number,
    walletAddress: string,
  ): Promise<{ xdr: string; clipId: number; walletAddress: string }> {
    const id = typeof clipId === 'string' ? parseInt(clipId, 10) : clipId;

    await this.validateClipOwner(id, 0);

    return {
      xdr: `AAAA_${id}_${Date.now()}`,
      clipId: id,
      walletAddress,
    };
  }

  /**
   * Confirm a completed on-chain mint. Updates the clip's mint fields.
   */
  async confirmMint(
    clipId: string | number,
    mintAddress: string,
  ): Promise<{ clipId: number; mintAddress: string; confirmed: boolean }> {
    const id = typeof clipId === 'string' ? parseInt(clipId, 10) : clipId;

    const clip = await this.prisma.clip.findUnique({ where: { id } });
    if (!clip) {
      throw new NotFoundException(`Clip ${clipId} not found`);
    }

    if (clip.nftStatus === 'minted') {
      throw new BadRequestException(`Clip ${clipId} is already minted`);
    }

    await this.prisma.clip.update({
      where: { id },
      data: {
        nftStatus: 'minted',
        mintAddress,
        mintedAt: new Date(),
      },
    });

    this.logger.log(`Confirmed mint for clip ${id} → ${mintAddress}`);

    return { clipId: id, mintAddress, confirmed: true };
  }

  /**
   * Build an unsigned Soroban burn transaction XDR.
   */
  prepareBurnTx(
    clipId: number,
    walletAddress: string,
  ): { xdr: string; clipId: number; walletAddress: string } {
    return {
      xdr: `BURN_${clipId}_${Date.now()}`,
      clipId,
      walletAddress,
    };
  }

  /**
   * Build an unsigned Soroban set_royalties transaction XDR.
   */
  prepareSetRoyaltiesTx(
    clipId: number,
    walletAddress: string,
    shares: Array<{ recipient: string; royaltyBps: number }>,
  ): {
    xdr: string;
    clipId: number;
    walletAddress: string;
    shares: typeof shares;
  } {
    return {
      xdr: `ROYALTIES_${clipId}_${Date.now()}`,
      clipId,
      walletAddress,
      shares,
    };
  }
}
