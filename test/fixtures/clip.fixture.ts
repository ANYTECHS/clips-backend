import { Clip } from '../../src/clips/clip.entity';

export function buildClip(overrides: Partial<Clip> = {}): Clip {
  return {
    id: 'clip-fixture-001',
    videoId: 'video-fixture-001',
    userId: 'user-fixture-001',
    startTime: 30,
    endTime: 75,
    duration: 45,
    positionRatio: 0.25,
    transcript: 'This is a sample transcript for the clip fixture.',
    viralityScore: 72,
    clipUrl: 'https://res.cloudinary.com/demo/video/upload/clips/clip-fixture-001.mp4',
    thumbnail: 'https://res.cloudinary.com/demo/video/upload/so_50p/clips/clip-fixture-001.jpg',
    status: 'success',
    error: undefined,
    localFilePath: undefined,
    selected: false,
    postStatus: null,
    caption: '🔥 Check out this viral moment! #shorts #viral',
    royaltyBps: 1000,
    createdAt: new Date('2026-01-15T10:05:00.000Z'),
    updatedAt: new Date('2026-01-15T10:06:00.000Z'),
    ...overrides,
  };
}

export function buildClipList(
  count: number,
  overrides: Partial<Clip> = {},
): Clip[] {
  return Array.from({ length: count }, (_, i) =>
    buildClip({
      id: `clip-fixture-${String(i + 1).padStart(3, '0')}`,
      startTime: i * 60,
      endTime: i * 60 + 45,
      positionRatio: i / Math.max(count, 1),
      viralityScore: Math.round(40 + Math.random() * 55),
      createdAt: new Date(Date.now() - i * 30_000),
      ...overrides,
    }),
  );
}

/** Prisma-shaped clip record (numeric ids, all DB fields). */
export function buildClipRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    videoId: 1,
    clipUrl: 'https://res.cloudinary.com/demo/video/upload/clips/clip-001.mp4',
    thumbnail: 'https://res.cloudinary.com/demo/video/upload/so_50p/clips/clip-001.jpg',
    platform: null,
    title: 'Viral Moment #1',
    caption: '🔥 You won\'t believe this! #shorts #viral #trending',
    startTime: 120.5,
    endTime: 165.0,
    duration: 45,
    viralityScore: 87.4,
    royaltyBps: 1000,
    postStatus: null,
    postedAt: null,
    metadataUri: null,
    mintAddress: null,
    mintedAt: null,
    nftStatus: 'none',
    createdAt: new Date('2026-01-15T10:05:00.000Z'),
    updatedAt: new Date('2026-01-15T10:06:00.000Z'),
    ...overrides,
  };
}

export function buildClipRecordList(
  count: number,
  overrides: Record<string, unknown> = {},
) {
  const viralityScores = [92.1, 85.7, 78.3, 71.9, 65.4, 58.2, 51.8, 44.6, 38.1, 31.5];
  return Array.from({ length: count }, (_, i) =>
    buildClipRecord({
      id: i + 1,
      title: `Viral Moment #${i + 1}`,
      startTime: i * 60,
      endTime: i * 60 + 45,
      viralityScore: viralityScores[i % viralityScores.length],
      createdAt: new Date(Date.now() - i * 30_000),
      ...overrides,
    }),
  );
}

/** Build a clip record with an associated earning for integration tests. */
export function buildClipWithEarning(overrides: Record<string, unknown> = {}) {
  return {
    ...buildClipRecord(),
    earnings: [
      {
        id: 1,
        clipId: 1,
        amount: 12.5,
        currency: 'USD',
        date: new Date('2026-01-20T00:00:00.000Z'),
        source: 'royalty',
        isAnomaly: false,
        anomalyReason: null,
        createdAt: new Date('2026-01-20T00:00:00.000Z'),
        deletedAt: null,
      },
    ],
    ...overrides,
  };
}
