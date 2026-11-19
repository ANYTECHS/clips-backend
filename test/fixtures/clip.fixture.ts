import { ClipEntity } from '../../src/clips/clip.entity';

/** Supported clip status values */
export type SupportedClipStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled';

/** Supported NFT status values */
export type SupportedNftStatus = 'none' | 'minting' | 'minted' | 'failed';

/**
 * Build a Clip entity with sensible defaults.
 * Supports overriding individual fields.
 *
 * @example
 * const clip = buildClip({ title: 'Custom Title', viralityScore: 95 });
 * const failed = buildClip({ status: 'failed', error: 'Processing error' });
 */
export function buildClip(overrides: Partial<ClipEntity> = {}): ClipEntity {
  const baseDate = new Date('2026-01-15T10:05:00.000Z');
  return {
    id: 1,
    videoId: 1,
    clipUrl:
      'https://res.cloudinary.com/demo/video/upload/clips/clip-001.mp4',
    thumbnail:
      'https://res.cloudinary.com/demo/video/upload/so_50p/clips/clip-001.jpg',
    platform: null,
    title: 'Viral Moment #1',
    caption: '🔥 You won\'t believe this! #shorts #viral #trending',
    startTime: 120.5,
    endTime: 165.0,
    duration: 44.5,
    viralityScore: 87.4,
    royaltyBps: 1000,
    selected: false,
    postStatus: null,
    postedAt: null,
    metadataUri: null,
    mintAddress: null,
    mintedAt: null,
    nftStatus: 'none',
    status: 'completed',
    localFilePath: null,
    error: null,
    createdAt: baseDate,
    updatedAt: baseDate,
    ...overrides,
  };
}

/**
 * Build a list of Clip entities with varied virality scores and timestamps.
 * IDs and timestamps are automatically incremented.
 *
 * @example
 * const clips = buildClipList(5);
 * const pending = buildClipList(3, { status: 'pending' });
 */
export function buildClipList(
  count: number,
  overrides: Partial<ClipEntity> = {},
): ClipEntity[] {
  const viralityScores = [
    92.1, 85.7, 78.3, 71.9, 65.4, 58.2, 51.8, 44.6, 38.1, 31.5,
  ];

  return Array.from({ length: count }, (_, i) => {
    const createdAt = new Date(Date.now() - i * 30_000); // 30 seconds apart
    return buildClip({
      id: i + 1,
      videoId: Math.floor(i / 5) + 1, // Group clips by video
      title: `Viral Moment #${i + 1}`,
      startTime: i * 60,
      endTime: i * 60 + 45,
      duration: 45,
      viralityScore: viralityScores[i % viralityScores.length],
      createdAt,
      updatedAt: createdAt,
      ...overrides,
    });
  });
}

/**
 * Build a Clip record with all Prisma database fields.
 * Includes realistic post statuses and NFT states.
 *
 * @example
 * const clip = buildClipRecord({ title: 'My Clip' });
 */
export function buildClipRecord(overrides: Record<string, unknown> = {}) {
  const baseDate = new Date('2026-01-15T10:05:00.000Z');
  return {
    id: 1,
    videoId: 1,
    clipUrl:
      'https://res.cloudinary.com/demo/video/upload/clips/clip-001.mp4',
    thumbnail:
      'https://res.cloudinary.com/demo/video/upload/so_50p/clips/clip-001.jpg',
    platform: null,
    title: 'Viral Moment #1',
    caption: '🔥 You won\'t believe this! #shorts #viral #trending',
    startTime: 120.5,
    endTime: 165.0,
    duration: 44.5,
    viralityScore: 87.4,
    royaltyBps: 1000,
    selected: false,
    postStatus: null,
    postedAt: null,
    metadataUri: null,
    mintAddress: null,
    mintedAt: null,
    nftStatus: 'none',
    status: 'pending',
    localFilePath: null,
    error: null,
    createdAt: baseDate,
    updatedAt: baseDate,
    ...overrides,
  };
}

/**
 * Build a list of Clip records with realistic variation.
 * Automatically increments IDs and adjusts timestamps and scores.
 *
 * @example
 * const clips = buildClipRecordList(10);
 * const minted = buildClipRecordList(3, { nftStatus: 'minted' });
 */
export function buildClipRecordList(
  count: number,
  overrides: Record<string, unknown> = {},
) {
  const viralityScores = [
    92.1, 85.7, 78.3, 71.9, 65.4, 58.2, 51.8, 44.6, 38.1, 31.5,
  ];

  return Array.from({ length: count }, (_, i) => {
    const createdAt = new Date(Date.now() - i * 30_000); // 30 seconds apart
    return buildClipRecord({
      id: i + 1,
      videoId: Math.floor(i / 5) + 1,
      title: `Viral Moment #${i + 1}`,
      startTime: i * 60,
      endTime: i * 60 + 45,
      duration: 45,
      viralityScore: viralityScores[i % viralityScores.length],
      createdAt,
      updatedAt: createdAt,
      ...overrides,
    });
  });
}

/**
 * Build a Clip record with a specific processing status.
 * Useful for testing status-specific logic.
 *
 * @example
 * const pending = buildClipWithStatus('pending');
 * const failed = buildClipWithStatus('failed', { error: 'Failed to extract audio' });
 */
export function buildClipWithStatus(
  status: SupportedClipStatus,
  overrides: Record<string, unknown> = {},
) {
  const baseOverrides: Record<string, unknown> =
    status === 'failed'
      ? {
          error: 'Failed to process clip',
          localFilePath: null,
        }
      : status === 'pending'
        ? {
            status: 'pending',
            error: null,
            selected: false,
          }
        : status === 'completed'
          ? {
              status: 'completed',
              error: null,
              selected: false,
            }
          : {};

  return buildClipRecord({
    status,
    ...baseOverrides,
    ...overrides,
  });
}

/**
 * Build a Clip record with a specific NFT minting status.
 * Useful for testing NFT-related workflows.
 *
 * @example
 * const minting = buildClipWithNftStatus('minting');
 * const minted = buildClipWithNftStatus('minted', {
 *   mintAddress: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEU4',
 *   metadataUri: 'ipfs://QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG',
 * });
 */
export function buildClipWithNftStatus(
  nftStatus: SupportedNftStatus,
  overrides: Record<string, unknown> = {},
) {
  const baseDate = new Date('2026-01-15T10:05:00.000Z');
  const baseOverrides: Record<string, unknown> =
    nftStatus === 'minted'
      ? {
          nftStatus: 'minted',
          mintAddress:
            'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEU4',
          metadataUri:
            'ipfs://QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG',
          mintedAt: baseDate,
        }
      : nftStatus === 'minting'
        ? {
            nftStatus: 'minting',
            mintAddress: null,
            metadataUri:
              'ipfs://QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG',
          }
        : nftStatus === 'failed'
          ? {
              nftStatus: 'failed',
              mintAddress: null,
              metadataUri: null,
            }
          : {
              nftStatus: 'none',
              mintAddress: null,
              metadataUri: null,
            };

  return buildClipRecord({
    ...baseOverrides,
    ...overrides,
  });
}

/**
 * Build a Clip record with post status (e.g., for social media platforms).
 * Useful for testing social media posting workflows.
 *
 * @example
 * const posted = buildClipWithPostStatus({
 *   instagram: { status: 'success', postId: 'insta-123' },
 *   tiktok: { status: 'pending' },
 * });
 */
export function buildClipWithPostStatus(
  postStatusMap: Record<string, unknown> = {},
  overrides: Record<string, unknown> = {},
) {
  const baseDate = new Date('2026-01-15T10:05:00.000Z');
  return buildClipRecord({
    postStatus: postStatusMap,
    postedAt: Object.keys(postStatusMap).length > 0 ? baseDate : null,
    ...overrides,
  });
}

/**
 * Build a Clip record with an associated earning record for integration tests.
 * Represents a clip that has generated revenue.
 *
 * @example
 * const clipWithEarning = buildClipWithEarning();
 */
export function buildClipWithEarning(overrides: Record<string, unknown> = {}) {
  const baseDate = new Date('2026-01-20T00:00:00.000Z');
  return {
    ...buildClipRecord(),
    earnings: [
      {
        id: 1,
        clipId: 1,
        amount: 12.5,
        currency: 'USD',
        amountInBaseCurrency: 12.5,
        exchangeRate: 1.0,
        date: baseDate,
        source: 'royalty',
        isAnomaly: false,
        anomalyReason: null,
        createdAt: baseDate,
        deletedAt: null,
      },
    ],
    ...overrides,
  };
}

/**
 * Build a Clip record with multiple earning records.
 * Useful for testing aggregation and reporting features.
 *
 * @example
 * const clipWithEarnings = buildClipWithMultipleEarnings(5);
 */
export function buildClipWithMultipleEarnings(
  earningCount: number = 3,
  overrides: Record<string, unknown> = {},
) {
  const baseDate = new Date('2026-01-15T00:00:00.000Z');
  const earnings = Array.from({ length: earningCount }, (_, i) => ({
    id: i + 1,
    clipId: 1,
    amount: Math.random() * 50,
    currency: 'USD',
    amountInBaseCurrency: Math.random() * 50,
    exchangeRate: 1.0,
    date: new Date(baseDate.getTime() + i * 24 * 60 * 60 * 1000),
    source: ['royalty', 'subscription', 'ad'][Math.floor(Math.random() * 3)],
    isAnomaly: Math.random() > 0.8,
    anomalyReason: Math.random() > 0.8 ? 'Unusual spike' : null,
    createdAt: new Date(baseDate.getTime() + i * 24 * 60 * 60 * 1000),
    deletedAt: null,
  }));

  return {
    ...buildClipRecord(),
    earnings,
    ...overrides,
  };
}

/**
 * Build a Clip record with realistic and varied data.
 * Useful for UI testing and visual regression tests.
 *
 * @example
 * const diverse = [
 *   buildClipVariant('trending'),
 *   buildClipVariant('niche'),
 *   buildClipVariant('viral'),
 * ];
 */
export function buildClipVariant(
  variant: 'trending' | 'niche' | 'viral' | 'lowPerforming' = 'trending',
  overrides: Record<string, unknown> = {},
) {
  const variantConfigs: Record<
    string,
    Record<string, unknown>
  > = {
    trending: {
      title: '🚀 Trending Now',
      caption: 'This is absolutely trending right now! Check it out #trending',
      viralityScore: 88.5,
      selected: true,
      postedAt: new Date('2026-01-14T10:00:00.000Z'),
      postStatus: {
        tiktok: { status: 'success', postId: 'tt-123' },
        instagram: { status: 'success', postId: 'ig-456' },
      },
    },
    viral: {
      title: '🔥 Going Viral',
      caption: 'This went viral overnight! 🚀 #viral #amazing',
      viralityScore: 95.2,
      selected: true,
      nftStatus: 'minted',
      mintAddress: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEU4',
      mintedAt: new Date('2026-01-15T08:00:00.000Z'),
    },
    niche: {
      title: 'Niche Content',
      caption: 'For the gaming enthusiasts out there',
      viralityScore: 32.1,
      selected: false,
      postedAt: null,
    },
    lowPerforming: {
      title: 'Underperforming Clip',
      caption: 'This clip didn\'t perform well',
      viralityScore: 12.3,
      selected: false,
      postStatus: { twitter: { status: 'failed', error: 'Rate limited' } },
    },
  };

  const config = variantConfigs[variant] || variantConfigs.trending;
  return buildClipRecord({
    ...config,
    ...overrides,
  });
}
