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
    return {
      name: clip.title?.trim() || `Clip #${clip.id}`,
      description: clip.caption?.trim() || `ClipCash generated clip ${clip.id}`,
      image: clip.thumbnail ?? clip.clipUrl,
      animation_url: clip.clipUrl,
      attributes: [
        { trait_type: 'clipId', value: clip.id },
        { trait_type: 'duration', value: clip.duration },
        { trait_type: 'viralityScore', value: clip.viralityScore ?? 0 },
        { trait_type: 'royaltyBps', value: clip.royaltyBps },
        { trait_type: 'createdAt', value: clip.createdAt.toISOString() },
      ],
    };
  }
}
