import { Video, VideoStatus } from '../../src/videos/video.entity';

export function buildVideo(overrides: Partial<Video> = {}): Video {
  return {
    id: 'video-fixture-001',
    userId: 'user-fixture-001',
    status: 'done' as VideoStatus,
    processingError: null,
    createdAt: new Date('2026-01-15T10:00:00.000Z'),
    updatedAt: new Date('2026-01-15T10:05:00.000Z'),
    ...overrides,
  };
}

export function buildVideoList(
  count: number,
  overrides: Partial<Video> = {},
): Video[] {
  return Array.from({ length: count }, (_, i) =>
    buildVideo({
      id: `video-fixture-${String(i + 1).padStart(3, '0')}`,
      createdAt: new Date(Date.now() - i * 60_000),
      ...overrides,
    }),
  );
}

/** Prisma-shaped video record (numeric id, all DB fields). */
export function buildVideoRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    userId: 1,
    title: 'My Viral Podcast Episode',
    description: 'A deep dive into content creation strategies.',
    sourceType: 'upload',
    sourceUrl: 'https://storage.example.com/videos/video-001.mp4',
    thumbnail: 'https://storage.example.com/thumbnails/video-001.jpg',
    duration: 3600,
    fileSize: BigInt(524_288_000), // 500 MB
    status: 'done',
    processingError: null,
    processingStats: {
      momentsFound: 42,
      inputQuality: '1080p',
      durationSec: 3600,
      clipsGenerated: 38,
      timeTakenMs: 120_000,
    },
    targetPlatforms: ['tiktok', 'instagram', 'youtube'],
    createdAt: new Date('2026-01-15T10:00:00.000Z'),
    updatedAt: new Date('2026-01-15T10:05:00.000Z'),
    ...overrides,
  };
}

export function buildVideoRecordList(
  count: number,
  overrides: Record<string, unknown> = {},
) {
  return Array.from({ length: count }, (_, i) =>
    buildVideoRecord({
      id: i + 1,
      title: `Video ${i + 1}`,
      duration: 1800 + i * 300,
      createdAt: new Date(Date.now() - i * 3_600_000),
      ...overrides,
    }),
  );
}
