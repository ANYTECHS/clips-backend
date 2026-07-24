import { Injectable } from '@nestjs/common';
import { NftMetadata } from './ipfs-upload.service';

interface ClipData {
  id: number;
  title: string | null;
  caption: string | null;
  clipUrl: string;
  thumbnail: string | null;
  duration: number;
  viralityScore: number | null;
  createdAt: Date;
  royaltyBps: number;
  royaltyRecipient?: string | null;
}

/**
 * Builds the NFT metadata JSON (OpenSea-compatible) for a given clip
 * before it is uploaded to IPFS.
 */
@Injectable()
export class NftMetadataService {
  /**
   * Generate an NFT metadata object from clip data.
   * Follows the ERC-721 / OpenSea metadata standard so it is compatible
   * with wallets, explorers, and marketplaces.
   */
  build(clip: ClipData): NftMetadata {
    const royaltyBps = clip.royaltyBps;
    const royaltyRecipient = clip.royaltyRecipient?.trim() || undefined;

    return {
      name: clip.title?.trim() || `Clip #${clip.id}`,
      description: clip.caption?.trim() || `ClipCash generated clip ${clip.id}`,
      image: clip.thumbnail ?? clip.clipUrl,
      animation_url: clip.clipUrl,
      attributes: [
        { trait_type: 'Clip Duration', value: clip.duration },
        { trait_type: 'Virality Score', value: clip.viralityScore ?? 0 },
        { trait_type: 'Creation Date', value: clip.createdAt.toISOString() },
        { trait_type: 'Royalty BPS', value: royaltyBps },
        { trait_type: 'Royalty Percent', value: royaltyBps / 100 },
      ],
      seller_fee_basis_points: royaltyBps,
      ...(royaltyRecipient ? { fee_recipient: royaltyRecipient } : {}),
      royalty: {
        bps: royaltyBps,
        percent: royaltyBps / 100,
        ...(royaltyRecipient ? { recipient: royaltyRecipient } : {}),
      },
    };
  }
}
