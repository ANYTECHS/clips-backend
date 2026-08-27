import { Injectable } from '@nestjs/common';
import { NftMetadata } from './ipfs-upload.service';
import { RoyaltyConfigurationService } from './royalty-configuration.service';

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
  /** Clip hashtags / tags */
  tags?: string[];
  /** Platforms the clip has been or will be posted to */
  platforms?: string[];
  /** Original video duration in seconds (the source video this clip was cut from) */
  originalVideoDuration?: number;
  /** Username / handle of the clip creator */
  creatorHandle?: string;
}

/**
 * Builds the NFT metadata JSON (OpenSea-compatible) for a given clip
 * before it is uploaded to IPFS.
 */
@Injectable()
export class NftMetadataService {
  constructor(
    private readonly royaltyConfigurationService: RoyaltyConfigurationService,
  ) {}

  /**
   * Generate an NFT metadata object from clip data.
   * Follows the ERC-721 / OpenSea metadata standard so it is compatible
   * with wallets, explorers, and marketplaces.
   */
  build(clip: ClipData): NftMetadata {
    const royaltyBps = clip.royaltyBps;
    const royaltyRecipient = clip.royaltyRecipient?.trim() || undefined;
    const asset = this.royaltyConfigurationService.getRoyaltyAsset();

    const attributes = [
      { trait_type: 'Clip Duration', value: clip.duration },
      { trait_type: 'Virality Score', value: clip.viralityScore ?? 0 },
      { trait_type: 'Creation Date', value: clip.createdAt.toISOString() },
      { trait_type: 'Royalty BPS', value: royaltyBps },
      { trait_type: 'Royalty Percent', value: royaltyBps / 100 },
      { trait_type: 'Platform', value: 'ClipCash' },
    ];

    if (clip.originalVideoDuration !== undefined && clip.originalVideoDuration !== null) {
      attributes.push({
        trait_type: 'Original Video Duration',
        value: clip.originalVideoDuration,
      });
    }

    if (clip.creatorHandle) {
      attributes.push({ trait_type: 'Creator', value: clip.creatorHandle });
    }

    if (clip.tags && clip.tags.length > 0) {
      attributes.push({ trait_type: 'Tags', value: clip.tags.join(', ') });
      attributes.push({ trait_type: 'Tag Count', value: clip.tags.length });
    }

    if (clip.platforms && clip.platforms.length > 0) {
      attributes.push({
        trait_type: 'Posted Platforms',
        value: clip.platforms.join(', '),
      });
      attributes.push({
        trait_type: 'Platform Count',
        value: clip.platforms.length,
      });
    }

    return {
      name: clip.title?.trim() || `Clip #${clip.id}`,
      description: clip.caption?.trim() || `ClipCash generated clip ${clip.id}`,
      image: clip.thumbnail ?? clip.clipUrl,
      animation_url: clip.clipUrl,
      attributes,
      seller_fee_basis_points: royaltyBps,
      ...(royaltyRecipient ? { fee_recipient: royaltyRecipient } : {}),
      royalty: {
        bps: royaltyBps,
        percent: royaltyBps / 100,
        ...(royaltyRecipient ? { recipient: royaltyRecipient } : {}),
        asset: asset.code,
        ...(asset.contractId ? { assetContractId: asset.contractId } : {}),
      },
      viralityScore: clip.viralityScore ?? 0,
      originalDuration: clip.duration,
      createdAt: clip.createdAt.toISOString(),
    };
  }
}
