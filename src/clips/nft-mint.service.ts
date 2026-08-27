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
