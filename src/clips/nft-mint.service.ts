/**
 * NftMintService handles clip metadata uploads, ownership checks, and Soroban
 * mint transaction preparation.
 */
import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NftMetadataService } from '../nft/nft-metadata.service';
import { IpfsUploadService } from '../nft/ipfs-upload.service';
import { StellarService } from '../stellar/stellar.service';
import { NftConfig } from '../nft/nft.config';
import {
  DEFAULT_NFT_COLLECTION_ID,
  isSupportedNftCollectionId,
} from '../nft/nft-collections.constants';
import {
  Contract,
  TransactionBuilder,
  TimeoutInfinite,
  nativeToScVal,
  xdr,
} from '@stellar/stellar-sdk';

export interface UploadMetadataResult {
  clipId: number;
  cid: string;
  metadataUri: string;
}

export interface PrepareMintTxResult {
  xdr: string;
  network: string;
  contractId: string;
  clipId: number;
  collectionId: string;
  walletAddress: string;
  metadataUri: string;
  royaltyBps: number;
}

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
   * @param clipId       Clip whose metadata should be uploaded.
   * @param collectionId Collection the clip is being minted into (metadata is
   *                     stamped with the collection's name/type/category).
   * @returns            UploadMetadataResult with clipId, cid, and metadataUri.
   */
  async uploadMetadataToIPFS(
    clipId: number,
    collectionId = DEFAULT_NFT_COLLECTION_ID,
    collectionId: string = DEFAULT_NFT_COLLECTION_ID,
  ): Promise<UploadMetadataResult> {
    const collection = await this.requireCollection(collectionId);
    const clip = await this.prisma.clip.findUnique({
      where: { id: clipId },
      include: { video: { select: { userId: true } } },
    });

    if (!clip) {
      throw new NotFoundException(`Clip ${clipId} not found`);
    }
    if (!clip.clipUrl) {
      throw new BadRequestException(
        `Clip ${clipId} is missing a clip URL — metadata cannot be built until the clip has been generated`,
      );
    }

    if (clip.metadataUri) {
      if (clip.collectionId && clip.collectionId !== collectionId) {
        throw new BadRequestException(
          `Clip ${clipId} metadata already belongs to collection '${clip.collectionId}'`,
        );
      }
      const cid = clip.metadataUri.replace(/^ipfs:\/\//, '');
      this.logger.log(
        `Clip ${clipId} already has IPFS metadata — returning cached CID: ${cid}`,
      );
      return { clipId, cid, metadataUri: clip.metadataUri };
    }

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
      collection: {
        collectionId: clip.collection.collectionId,
        name: clip.collection.name,
        type: clip.collection.type,
        metadata: clip.collection.metadata as Record<string, unknown>,
      },
    });
    // Upload to IPFS — provider (Pinata / nft.storage) resolved by config.

    const metadataUri = await this.ipfsUploadService.uploadMetadata(
      metadata,
      clipId,
    );
    // Persist the CID to the Clip record so subsequent mint calls can
    // skip the upload step.
    await this.prisma.clip.update({
      where: { id: clipId },
      data: {
        metadataUri,
        collectionId,
        ...(collection.royaltyBps !== null
          ? { royaltyBps: collection.royaltyBps }
          : {}),
      },
    });
    const cid = metadataUri.replace(/^ipfs:\/\//, '');

    await this.prisma.clip.update({
      where: { id: clipId },
      data: {
        metadataUri,
        collectionId,
        ...(collection.royaltyBps !== null
          ? { royaltyBps: collection.royaltyBps }
          : {}),
      },
    });

    const cid = metadataUri.replace(/^ipfs:\/\//, '');
    this.logger.log(
      `Clip ${clipId} metadata uploaded to IPFS — CID: ${cid} | provider: ${process.env.IPFS_PROVIDER ?? 'pinata'}`,
    );
    return { clipId, cid, metadataUri };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Issue #749 — Prepare Soroban mint transaction
  // ──────────────────────────────────────────────────────────────────────────

  async prepareMintTx(
    clipId: number,
    walletAddress: string,
    collectionId?: string,
  ): Promise<PrepareMintTxResult> {
    const addrValidation = this.stellarService.validateAddress(walletAddress);
    if (!addrValidation.valid) {
      throw new BadRequestException(
        addrValidation.message ?? `Invalid Stellar wallet: ${walletAddress}`,
      );
    }
    await this.assertMintCooldown(walletAddress);

    const clip = await this.prisma.clip.findUnique({ where: { id: clipId } });
    if (!clip) throw new NotFoundException(`Clip ${clipId} not found`);
    if (clip.mintAddress || clip.nftStatus === 'minted')
      throw new ConflictException(`Clip ${clipId} is already minted`);
    if (clip.nftStatus === 'minting')
      throw new ConflictException(
        `Clip ${clipId} is currently being minted. Please wait.`,
      );
    if (this.isPosted(clip.postStatus)) {
      throw new BadRequestException(
        `Posted clips cannot be minted. Clip ${clipId} has already been posted.`,
      );
    }

    const selectedCollectionId =
      collectionId ?? clip.collectionId ?? DEFAULT_NFT_COLLECTION_ID;
    const collection = await this.requireCollection(selectedCollectionId);
    if (
      clip.metadataUri &&
      clip.collectionId &&
      clip.collectionId !== selectedCollectionId
    ) {
      throw new BadRequestException(
        `Clip ${clipId} metadata already belongs to collection '${clip.collectionId}'`,
      );
    }
    if (collection.maxSupply !== null) {
      const supply = await this.getCollectionSupply(selectedCollectionId);
      if (supply >= collection.maxSupply) {
        throw new BadRequestException(
          `Collection '${selectedCollectionId}' has reached its maximum supply`,
        );
      }
    }

    let metadataUri = clip.metadataUri;
    if (!metadataUri) {
      this.logger.log(
        `Clip ${clipId} has no metadataUri — uploading to IPFS before building XDR`,
      );
      metadataUri = (
        await this.uploadMetadataToIPFS(clipId, selectedCollectionId)
      ).metadataUri;
    }

    const royaltyBps = collection.royaltyBps ?? clip.royaltyBps ?? 1000;
    const creatorRoyaltyBps = royaltyBps;
    const platformRoyaltyBps = this.nftConfig.platformRoyaltyBps;
    const totalBps = creatorRoyaltyBps + platformRoyaltyBps;
    if (totalBps > 10000) {
      throw new BadRequestException(
        `Combined royalty (${totalBps} bps = ${creatorRoyaltyBps} creator + ${platformRoyaltyBps} platform) exceeds maximum of 10000 bps`,
      );
    }

    const royaltyBps = clip.collection.royaltyBps ?? clip.royaltyBps ?? 1000;
    const contractId = process.env.SOROBAN_NFT_CONTRACT_ID ?? '';
    if (!contractId) {
      throw new BadRequestException(
        'SOROBAN_NFT_CONTRACT_ID is not configured — cannot prepare mint transaction',
      );
    }

    await this.prisma.clip.update({
      where: { id: clipId },
      data: {
        collectionId: selectedCollectionId,
        nftStatus: 'minting',
        mintWalletAddress: walletAddress,
        ...(collection.royaltyBps !== null
          ? { royaltyBps: collection.royaltyBps }
          : {}),
      },
    });

    const xdr = await this.buildMintXdr({
      clipId,
      collectionId: selectedCollectionId,
      walletAddress,
      contractId,
      metadataUri,
      royaltyBps,
      creatorRoyaltyBps,
      platformWallet: this.nftConfig.platformWallet,
      platformRoyaltyBps,
      network: this.stellarService.network,
    });

    this.logger.log(
      `Mint XDR prepared — clip: ${clipId}, collection: ${selectedCollectionId}, wallet: ${walletAddress}, network: ${this.stellarService.network}, royaltyBps: ${royaltyBps}`,
    );

    return {
      xdr,
      network: this.stellarService.network,
      contractId,
      clipId,
      collectionId: selectedCollectionId,
      walletAddress,
      metadataUri,
      royaltyBps,
    };
  }


  async validateClipOwner(clipId: number, userId: number): Promise<void> {
    const clip = await this.prisma.clip.findUnique({
      where: { id: clipId },
      include: { video: { select: { userId: true } } },
    });
    if (!clip) throw new NotFoundException(`Clip ${clipId} not found`);
    if (clip.video.userId !== userId)
      throw new ForbiddenException(`You do not own clip ${clipId}`);
  }

  async assertMintCooldown(walletAddress: string): Promise<void> {
    const cooldownSeconds =
      this.nftConfig.nftMintWalletCooldownSeconds ?? 60;
    if (cooldownSeconds <= 0) return;

    const lastMint = await this.prisma.nftWalletMintCooldown.findUnique({
      where: { walletAddress },
    });
    if (!lastMint) return;

    const retryAt = new Date(
      lastMint.lastMintAt.getTime() + cooldownSeconds * 1000,
    );
    const retryAfterSeconds = Math.ceil((retryAt.getTime() - Date.now()) / 1000);
    if (retryAfterSeconds <= 0) return;

    throw new HttpException(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        message: `Wallet mint cooldown is active. Retry in ${retryAfterSeconds} second(s).`,
        error: 'Too Many Requests',
        retryAfterSeconds,
        retryAt: retryAt.toISOString(),
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  async recordSuccessfulMint(walletAddress: string): Promise<void> {
    const lastMintAt = new Date();
    await this.prisma.nftWalletMintCooldown.upsert({
      where: { walletAddress },
      create: { walletAddress, lastMintAt },
      update: { lastMintAt },
    });
  }

  async confirmMint(
    clipId: number,
    mintAddress: string,
    onChainOwnerAddress: string,
  ): Promise<{ clipId: number; mintAddress: string; mintedAt: Date; nftStatus: string }> {
    const clip = await this.prisma.clip.findUnique({ where: { id: clipId } });
    if (!clip) throw new NotFoundException(`Clip ${clipId} not found`);
    if (clip.mintAddress || clip.nftStatus === 'minted')
      throw new BadRequestException(`Clip ${clipId} already minted`);
    if (
      !clip.mintWalletAddress ||
      clip.mintWalletAddress !== onChainOwnerAddress
    ) {
      throw new ConflictException(
        `On-chain owner does not match the wallet used to prepare clip ${clipId} mint`,
      );
    }
    const mintedAt = new Date();
    await this.prisma.clip.update({
      where: { id: clipId },
      data: { mintAddress, mintedAt, nftStatus: 'minted' },
    });
    if (clip.mintWalletAddress) {
      await this.recordSuccessfulMint(clip.mintWalletAddress);
    }
    this.logger.log(
      `Clip ${clipId} confirmed as minted — token: ${mintAddress}`,
    );
    return { clipId, mintAddress, mintedAt, nftStatus: 'minted' };
  }


  async prepareBurnTx(
    clipId: number,
    walletAddress: string,
    refundRoyalties = false,
  ) {
    if (!Number.isSafeInteger(clipId) || clipId <= 0) {
      throw new BadRequestException('Token ID must be a positive safe integer');
    }
    const addrValidation = this.stellarService.validateAddress(walletAddress);
    if (!addrValidation.valid)
      throw new BadRequestException(addrValidation.message);
    const contractId = process.env.SOROBAN_NFT_CONTRACT_ID ?? '';
    if (!contractId)
      throw new BadRequestException('SOROBAN_NFT_CONTRACT_ID not configured');
    const xdr = Buffer.from(
      JSON.stringify({
        contract: contractId,
        function: 'burn',
        args: {
          owner: walletAddress,
          token_id: String(clipId),
          refund_royalties: refundRoyalties,
        },
        network: this.stellarService.network,
      }),
    ).toString('base64');
    return {
      xdr,
      tokenId: clipId,
      owner: walletAddress,
      contractId,
      network: this.stellarService.network,
      refundRoyalties,
    };
  }

  async prepareSetRoyaltiesTx(
    clipId: number,
    walletAddress: string,
    shares: Array<{ recipient: string; bps: number }>,
  ) {
    const addrValidation = this.stellarService.validateAddress(walletAddress);
    if (!addrValidation.valid)
      throw new BadRequestException(addrValidation.message);
    const totalBps = shares.reduce((sum, s) => sum + s.bps, 0);
    if (totalBps > 10000)
      throw new BadRequestException(
        `Combined royalty shares (${totalBps} bps) exceed 10000 bps`,
      );
    const contractId = process.env.SOROBAN_NFT_CONTRACT_ID ?? '';
    if (!contractId)
      throw new BadRequestException('SOROBAN_NFT_CONTRACT_ID not configured');
    const xdr = Buffer.from(
      JSON.stringify({
        contract: contractId,
        function: 'set_royalties',
        args: { token_id: String(clipId), royalties: shares },
        network: this.stellarService.network,
      }),
    ).toString('base64');
    return { xdr, tokenId: clipId, shares, totalBps };
  }

  async prepareClaimRoyaltiesTx(
    clipId: number,
    walletAddress: string,
    assetContractId?: string,
  ) {
    const addrValidation = this.stellarService.validateAddress(walletAddress);
    if (!addrValidation.valid)
      throw new BadRequestException(addrValidation.message);
    const contractId = process.env.SOROBAN_NFT_CONTRACT_ID ?? '';
    if (!contractId)
      throw new BadRequestException('SOROBAN_NFT_CONTRACT_ID not configured');
    const xdr = Buffer.from(
      JSON.stringify({
        contract: contractId,
        function: 'claim_royalties',
        args: {
          recipient: walletAddress,
          token_id: String(clipId),
          ...(assetContractId ? { asset_contract_id: assetContractId } : {}),
        },
        network: this.stellarService.network,
      }),
    ).toString('base64');
    return {
      xdr,
      tokenId: clipId,
      recipient: walletAddress,
      claimableBalance: 0,
      contractId,
      network: this.stellarService.network,
    };
  }

  private isPosted(postStatus: unknown): boolean {
    if (!postStatus || typeof postStatus !== 'object') return false;
    return Object.values(postStatus as Record<string, unknown>).some(
      (v) => v === 'posted',
    );
  }

  private async requireCollection(collectionId: string) {
    if (!isSupportedNftCollectionId(collectionId)) {
      throw new BadRequestException(
        `Unsupported collectionId: ${collectionId}`,
      );
    }
    const collection = await this.prisma.nftCollection.findUnique({
      where: { collectionId },
    });
    if (!collection) {
      throw new BadRequestException(
        `Unsupported collectionId: ${collectionId}`,
      );
    }
    return collection;
  }

  private async getCollectionSupply(collectionId: string): Promise<number> {
    return this.prisma.clip.count({
      where: {
        collectionId,
        mintAddress: { not: null },
        nftStatus: { not: 'burned' },
      },
    });
  }

  private async buildMintXdr(params: {
  private buildMintXdr(params: {
    clipId: number;
    collectionId: string;
    walletAddress: string;
    contractId: string;
    metadataUri: string;
    royaltyBps: number;
    creatorRoyaltyBps: number;
    platformWallet: string;
    platformRoyaltyBps: number;
    network: string;
  }): Promise<string> {
    const mapOf = (entries: Array<[string, xdr.ScVal]>): xdr.ScVal =>
      xdr.ScVal.scvMap(
        entries.map(
          ([k, v]) =>
            new xdr.ScMapEntry({
              key: nativeToScVal(k, { type: 'string' }),
              val: v,
            }),
        ),
      );

    const recipientsVec = xdr.ScVal.scvVec([
      mapOf([
        ['wallet', nativeToScVal(params.walletAddress, { type: 'address' })],
        ['bps', nativeToScVal(params.creatorRoyaltyBps, { type: 'u32' })],
        ['label', nativeToScVal('creator', { type: 'string' })],
      ]),
      mapOf([
        ['wallet', nativeToScVal(params.platformWallet, { type: 'address' })],
        ['bps', nativeToScVal(params.platformRoyaltyBps, { type: 'u32' })],
        ['label', nativeToScVal('platform', { type: 'string' })],
      ]),
    ]);

    const royaltyExtension = mapOf([['recipients', recipientsVec]]);

    const args: xdr.ScVal[] = [
      nativeToScVal(params.walletAddress, { type: 'address' }),
      nativeToScVal(String(params.clipId), { type: 'string' }),
      nativeToScVal(params.collectionId, { type: 'string' }),
      nativeToScVal(params.metadataUri, { type: 'string' }),
      nativeToScVal(params.royaltyBps, { type: 'u32' }),
      royaltyExtension,
    ];

    const sourceAccount = await this.stellarService.getAccount(
      params.walletAddress,
    );
    const contract = new Contract(params.contractId);
    const operation = contract.call('mint', ...args);

    const tx = new TransactionBuilder(sourceAccount, {
      fee: '10000',
      networkPassphrase: this.stellarService.networkPassphrase,
    })
      .addOperation(operation)
      .setTimeout(TimeoutInfinite)
      .build();

    return tx.toXDR();
  }): string {
    return Buffer.from(
      JSON.stringify({
        contract: params.contractId,
        function: 'mint',
        args: {
          to: params.walletAddress,
          token_id: String(params.clipId),
          collection_id: params.collectionId,
          metadata: params.metadataUri,
          royalty_bps: params.royaltyBps,
        },
        royalty_extension: {
          recipients: [
            {
              wallet: params.walletAddress,
              bps: params.creatorRoyaltyBps,
              label: 'creator',
            },
            {
              wallet: params.platformWallet,
              bps: params.platformRoyaltyBps,
              label: 'platform',
            },
          ],
        },
        network: params.network,
        built_at: new Date().toISOString(),
      }),
    ).toString('base64');
  }
}

