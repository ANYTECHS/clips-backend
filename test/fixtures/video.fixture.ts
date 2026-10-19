import { Video, VideoStatus } from '../../src/videos/video.entity';

/** Supported video status values */
export type SupportedVideoStatus = 'pending' | 'processing' | 'done' | 'failed' | 'cancelled';

/**
 * Build a Video entity with sensible defaults.
 * Supports overriding individual fields.
 *
 * @example
 * const video = buildVideo({ status: 'failed', processingError: 'Timeout' });
 */
export function buildVideo(overrides: Partial<Video> = {}): Video {
  const baseDate = new Date('2026-01-15T10:00:00.000Z');
  return {
    id: 'video-fixture-001',
    userId: 'user-fixture-001',
    status: 'done' as VideoStatus,
    processingError: null,
    createdAt: baseDate,
    updatedAt: new Date(baseDate.getTime() + 5 * 60_000), // 5 minutes later
    ...overrides,
  };
}

/**
 * Build a list of Video entities with varied realistic timestamps.
 * IDs and timestamps are automatically incremented.
 *
 * @example
 * const videos = buildVideoList(5);
 * const failed = buildVideoList(3, { status: 'failed' });
 */
export function buildVideoList(
  count: number,
  overrides: Partial<Video> = {},
): Video[] {
  return Array.from({ length: count }, (_, i) => {
    const createdAt = new Date(Date.now() - i * 60_000); // 60 seconds apart
    return buildVideo({
      id: `video-fixture-${String(i + 1).padStart(3, '0')}`,
      userId: `user-fixture-${String((i % 3) + 1).padStart(3, '0')}`,
      createdAt,
      updatedAt: new Date(createdAt.getTime() + 5 * 60_000),
      ...overrides,
    });
  });
}

/**
 * Build a Video record with all Prisma database fields (numeric id).
 * Includes realistic processing stats and metadata.
 *
 * @example
 * const video = buildVideoRecord({ title: 'My Custom Video' });
 */
export function buildVideoRecord(overrides: Record<string, unknown> = {}) {
  const baseDate = new Date('2026-01-15T10:00:00.000Z');
  return {
    id: 1,
    userId: 1,
    title: 'My Viral Podcast Episode',
    description: 'A deep dive into content creation strategies.',
    sourceType: 'upload',
    sourceUrl: 'https://storage.example.com/videos/video-001.mp4',
    thumbnail: 'https://storage.example.com/thumbnails/video-001.jpg',
    duration: 3600, // 1 hour
    fileSize: BigInt(524_288_000), // 500 MB
    status: 'done',
    processingError: null,
    processingStats: {
      momentsFound: 42,
      inputQuality: '1080p',
      durationSec: 3600,
      clipsGenerated: 38,
      timeTakenMs: 120_000,
      avgDurationSec: 95,
    },
    metadata: {
      duration: 3600,
      width: 1920,
      height: 1080,
      format: 'mp4',
      fps: 30,
      bitrate: 5000,
    },
    targetPlatforms: ['tiktok', 'instagram', 'youtube'],
    createdAt: baseDate,
    updatedAt: new Date(baseDate.getTime() + 5 * 60_000),
    ...overrides,
  };
}

/**
 * Build a list of Video records with realistic variation.
 * Automatically increments IDs and adjusts timestamps and stats.
 *
 * @example
 * const videos = buildVideoRecordList(10);
 * const processing = buildVideoRecordList(3, { status: 'processing' });
 */
export function buildVideoRecordList(
  count: number,
  overrides: Record<string, unknown> = {},
) {
  const titles = [
    'Podcast Deep Dive',
    'Gaming Highlights',
    'Travel Vlog',
    'Educational Series',
    'Comedy Show',
    'Music Performance',
    'Interview Session',
    'Tutorial',
  ];

  return Array.from({ length: count }, (_, i) => {
    const createdAt = new Date(Date.now() - i * 3_600_000); // 1 hour apart
    return buildVideoRecord({
      id: i + 1,
      userId: (i % 5) + 1, // Distribute across 5 users
      title: titles[i % titles.length],
      duration: 1800 + i * 300, // Vary durations
      processingStats: {
        momentsFound: 30 + Math.floor(Math.random() * 30),
        inputQuality: ['480p', '720p', '1080p', '4K'][Math.floor(Math.random() * 4)],
        durationSec: 1800 + i * 300,
        clipsGenerated: 25 + Math.floor(Math.random() * 20),
        timeTakenMs: 60_000 + Math.floor(Math.random() * 120_000),
      },
      createdAt,
      updatedAt: new Date(createdAt.getTime() + 5 * 60_000),
      ...overrides,
    });
  });
}

/**
 * Build a Video record with a specific processing status.
 * Useful for testing status-specific logic.
 *
 * @example
 * const pending = buildVideoWithStatus('pending');
 * const failed = buildVideoWithStatus('failed', { processingError: 'Invalid format' });
 */
export function buildVideoWithStatus(
  status: SupportedVideoStatus,
  overrides: Record<string, unknown> = {},
) {
  const baseOverrides: Record<string, unknown> =
    status === 'failed'
      ? {
          processingError: 'Video processing timeout after 30 minutes',
          processingStats: {
            momentsFound: 0,
            inputQuality: '1080p',
            durationSec: 3600,
            clipsGenerated: 0,
            timeTakenMs: 1_800_000,
            errorDetails: 'Timeout during clip extraction',
          },
        }
      : status === 'processing'
        ? {
            processingError: null,
            processingStats: {
              momentsFound: 10,
              inputQuality: '1080p',
              durationSec: 3600,
              clipsGenerated: 8,
              timeTakenMs: 45_000,
            },
          }
        : {};

  return buildVideoRecord({
    status,
    ...baseOverrides,
    ...overrides,
  });
}
