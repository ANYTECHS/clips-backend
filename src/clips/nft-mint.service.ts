import {
  Injectable, Logger, NotFoundException, BadRequestException,
  ForbiddenException, ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NftMetadataService } from '../nft/nft-metadata.service';
import { IpfsUploadService } from '../nft/ipfs-upload.service';
import { StellarService } from '../stellar/stellar.service';
import { NftConfig } from '../nft/nft.config';

export interface UploadMetadataResult { clipId: number; cid: string; metadataUri: string; }
export interface PrepareMintTxResult {
  xdr: string; network: string; contractId: string;
  clipId: number; walletAddress: string; metadataUri: string; royaltyBps: number;
}

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

  async uploadMetadataToIPFS(clipId: number): Promise<UploadMetadataResult> {
    const clip = await this.prisma.clip.findUnique({ where: { id: clipId }, include: { video: { select: { userId: true } } } });
    if (!clip) throw new NotFoundException(`Clip ${clipId} not found`);
    if (!clip.clipUrl) throw new BadRequestException(`Clip ${clipId} has no clip URL`);
    if (clip.metadataUri) {
      const cid = clip.metadataUri.replace(/^ipfs:\/\//, '');
      return { clipId, cid, metadataUri: clip.metadataUri };
    }
    const metadata = this.nftMetadataService.build({
      id: clip.id, title: clip.title, caption: clip.caption, clipUrl: clip.clipUrl,
      thumbnail: clip.thumbnail, duration: clip.duration, viralityScore: clip.viralityScore,
      createdAt: clip.createdAt, royaltyBps: clip.royaltyBps ?? 1000,
    });
    const metadataUri = await this.ipfsUploadService.uploadMetadata(metadata, clipId);
    await this.prisma.clip.update({ where: { id: clipId }, data: { metadataUri } });
    return { clipId, cid: metadataUri.replace(/^ipfs:\/\//, ''), metadataUri };
  }

  async prepareMintTx(clipId: number, walletAddress: string): Promise<PrepareMintTxResult> {
    const addrValidation = this.stellarService.validateAddress(walletAddress);
    if (!addrValidation.valid) throw new BadRequestException(addrValidation.message ?? `Invalid wallet address`);
    const clip = await this.prisma.clip.findUnique({ where: { id: clipId } });
    if (!clip) throw new NotFoundException(`Clip ${clipId} not found`);
    if (clip.mintAddress) throw new ConflictException(`Clip ${clipId} already minted`);
    if (this.isPosted(clip.postStatus)) throw new BadRequestException(`Posted clips cannot be minted`);
    let metadataUri = clip.metadataUri;
    if (!metadataUri) metadataUri = (await this.uploadMetadataToIPFS(clipId)).metadataUri;
    const royaltyBps = clip.royaltyBps ?? 1000;
    const contractId = process.env.SOROBAN_NFT_CONTRACT_ID ?? '';
    if (!contractId) throw new BadRequestException('SOROBAN_NFT_CONTRACT_ID not configured');
    await this.prisma.clip.update({ where: { id: clipId }, data: { nftStatus: 'minting' } });
    const xdr = this.buildMintXdr({ clipId, walletAddress, contractId, metadataUri, royaltyBps,
      creatorRoyaltyBps: this.nftConfig.creatorRoyaltyBps, platformWallet: this.nftConfig.platformWallet,
      platformRoyaltyBps: this.nftConfig.platformRoyaltyBps, network: this.stellarService.network });
    return { xdr, network: this.stellarService.network, contractId, clipId, walletAddress, metadataUri, royaltyBps };
  }

  async validateClipOwner(clipId: number, userId: number): Promise<void> {
    const clip = await this.prisma.clip.findUnique({ where: { id: clipId }, include: { video: { select: { userId: true } } } });
    if (!clip) throw new NotFoundException(`Clip ${clipId} not found`);
    if (clip.video.userId !== userId) throw new ForbiddenException(`You do not own clip ${clipId}`);
  }

  async confirmMint(clipId: number, mintAddress: string): Promise<{ clipId: number; mintAddress: string; mintedAt: Date }> {
    const clip = await this.prisma.clip.findUnique({ where: { id: clipId } });
    if (!clip) throw new NotFoundException(`Clip ${clipId} not found`);
    if (clip.mintAddress) throw new BadRequestException(`Clip ${clipId} already minted`);
    const mintedAt = new Date();
    await this.prisma.clip.update({ where: { id: clipId }, data: { mintAddress, mintedAt, nftStatus: 'minted' } });
    return { clipId, mintAddress, mintedAt };
  }

  async prepareBurnTx(clipId: number, walletAddress: string) {
    const addrValidation = this.stellarService.validateAddress(walletAddress);
    if (!addrValidation.valid) throw new BadRequestException(addrValidation.message);
    const contractId = process.env.SOROBAN_NFT_CONTRACT_ID ?? '';
    if (!contractId) throw new BadRequestException('SOROBAN_NFT_CONTRACT_ID not configured');
    const xdr = Buffer.from(JSON.stringify({ contract: contractId, function: 'burn', args: { owner: walletAddress, token_id: String(clipId) }, network: this.stellarService.network })).toString('base64');
    return { xdr, tokenId: clipId, owner: walletAddress, contractId, network: this.stellarService.network };
  }

  async prepareSetRoyaltiesTx(clipId: number, walletAddress: string, shares: Array<{ recipient: string; bps: number }>) {
    const addrValidation = this.stellarService.validateAddress(walletAddress);
    if (!addrValidation.valid) throw new BadRequestException(addrValidation.message);
    const totalBps = shares.reduce((sum, s) => sum + s.bps, 0);
    if (totalBps > 10000) throw new BadRequestException(`Combined royalty shares (${totalBps} bps) exceed 10000 bps`);
    const contractId = process.env.SOROBAN_NFT_CONTRACT_ID ?? '';
    if (!contractId) throw new BadRequestException('SOROBAN_NFT_CONTRACT_ID not configured');
    const xdr = Buffer.from(JSON.stringify({ contract: contractId, function: 'set_royalties', args: { token_id: String(clipId), royalties: shares }, network: this.stellarService.network })).toString('base64');
    return { xdr, tokenId: clipId, shares, totalBps };
  }

  async prepareClaimRoyaltiesTx(clipId: number, walletAddress: string, assetContractId?: string) {
    const addrValidation = this.stellarService.validateAddress(walletAddress);
    if (!addrValidation.valid) throw new BadRequestException(addrValidation.message);
    const contractId = process.env.SOROBAN_NFT_CONTRACT_ID ?? '';
    if (!contractId) throw new BadRequestException('SOROBAN_NFT_CONTRACT_ID not configured');
    const xdr = Buffer.from(JSON.stringify({ contract: contractId, function: 'claim_royalties', args: { recipient: walletAddress, token_id: String(clipId), ...(assetContractId ? { asset_contract_id: assetContractId } : {}) }, network: this.stellarService.network })).toString('base64');
    return { xdr, tokenId: clipId, recipient: walletAddress, claimableBalance: 0, contractId, network: this.stellarService.network };
  }

  private isPosted(postStatus: unknown): boolean {
    if (!postStatus || typeof postStatus !== 'object') return false;
    return Object.values(postStatus as Record<string, unknown>).some(v => v === 'posted');
  }

  private buildMintXdr(params: { clipId: number; walletAddress: string; contractId: string; metadataUri: string; royaltyBps: number; creatorRoyaltyBps: number; platformWallet: string; platformRoyaltyBps: number; network: string }): string {
    return Buffer.from(JSON.stringify({
      contract: params.contractId, function: 'mint',
      args: { to: params.walletAddress, token_id: String(params.clipId), metadata: params.metadataUri, royalty_bps: params.royaltyBps },
      royalty_extension: { recipients: [{ wallet: params.walletAddress, bps: params.creatorRoyaltyBps, label: 'creator' }, { wallet: params.platformWallet, bps: params.platformRoyaltyBps, label: 'platform' }] },
      network: params.network, built_at: new Date().toISOString(),
    })).toString('base64');
  }
}
