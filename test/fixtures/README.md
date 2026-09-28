# Test Fixtures

This directory contains reusable factory functions for generating realistic test data for Video and Clip models.

## Overview

Test fixtures help you:
- Avoid hardcoding test data across multiple test files
- Generate consistent, realistic data with sensible defaults
- Override specific fields for targeted testing
- Create large datasets for performance testing
- Ensure maintainability when the schema changes

## Video Fixtures

Located in `video.fixture.ts`.

### Basic Usage

```typescript
import { buildVideo, buildVideoRecord } from './fixtures/video.fixture';

// Build a simple Video entity with defaults
const video = buildVideo();

// Override specific fields
const failedVideo = buildVideo({
  status: 'failed',
  processingError: 'Timeout after 30 minutes',
});

// Generate multiple videos
const videos = buildVideoList(5);
```

### Available Functions

#### `buildVideo(overrides?: Partial<Video>): Video`

Build a single Video entity with sensible defaults.

**Defaults:**
- `id`: 'video-fixture-001'
- `userId`: 'user-fixture-001'
- `status`: 'done'
- `processingError`: null
- `createdAt`: 2026-01-15T10:00:00Z
- `updatedAt`: 2026-01-15T10:05:00Z

**Example:**
```typescript
const video = buildVideo({ userId: 'custom-user-id' });
```

#### `buildVideoList(count: number, overrides?: Partial<Video>): Video[]`

Generate a list of Video entities with automatically varied timestamps and IDs.

**Example:**
```typescript
// Generate 10 videos with different IDs and timestamps
const videos = buildVideoList(10);

// Generate 5 failed videos
const failedVideos = buildVideoList(5, { status: 'failed' });
```

#### `buildVideoRecord(overrides?: Record<string, unknown>): Object`

Build a Prisma-shaped Video record with numeric IDs and all database fields.

**Defaults:**
- `id`: 1
- `userId`: 1
- `title`: 'My Viral Podcast Episode'
- `duration`: 3600 (1 hour)
- `fileSize`: 524_288_000 (500 MB)
- `processingStats`: Complete with momentsFound, quality, etc.
- `metadata`: Video dimensions, fps, bitrate
- `targetPlatforms`: ['tiktok', 'instagram', 'youtube']

**Example:**
```typescript
const video = buildVideoRecord({ title: 'My Custom Video' });
```

#### `buildVideoRecordList(count: number, overrides?: Record<string, unknown>): Object[]`

Generate a list of Video records with realistic variation.

**Example:**
```typescript
const videos = buildVideoRecordList(10);
```

#### `buildVideoWithStatus(status: VideoStatus, overrides?: Record<string, unknown>): Object`

Build a Video record with a specific processing status and appropriate defaults.

**Supported statuses:**
- `pending`: Ready to process
- `processing`: Currently processing
- `done`: Processing completed successfully
- `failed`: Processing failed with error details
- `cancelled`: Processing was cancelled

**Example:**
```typescript
const pending = buildVideoWithStatus('pending');
const failed = buildVideoWithStatus('failed', {
  processingError: 'Invalid video format',
});
```

## Clip Fixtures

Located in `clip.fixture.ts`.

### Basic Usage

```typescript
import {
  buildClip,
  buildClipRecord,
  buildClipWithStatus,
  buildClipWithNftStatus,
} from './fixtures/clip.fixture';

// Build a simple Clip entity
const clip = buildClip();

// Build with custom virality score
const viral = buildClip({ viralityScore: 95.5 });

// Build in a specific status
const minted = buildClipWithNftStatus('minted');

// Generate multiple clips
const clips = buildClipList(10);
```

### Available Functions

#### `buildClip(overrides?: Partial<ClipEntity>): ClipEntity`

Build a single Clip entity with sensible defaults.

**Defaults:**
- `id`: 1
- `videoId`: 1
- `status`: 'completed'
- `nftStatus`: 'none'
- `viralityScore`: 87.4
- `royaltyBps`: 1000 (10%)
- `selected`: false
- `createdAt`/`updatedAt`: 2026-01-15T10:05:00Z

**Example:**
```typescript
const clip = buildClip({
  title: 'Amazing Moment',
  viralityScore: 92.5,
});
```

#### `buildClipList(count: number, overrides?: Partial<ClipEntity>): ClipEntity[]`

Generate a list of Clip entities with varied virality scores and timestamps.

**Example:**
```typescript
const clips = buildClipList(5);
const pending = buildClipList(3, { status: 'pending' });
```

#### `buildClipRecord(overrides?: Record<string, unknown>): Object`

Build a Prisma-shaped Clip record with numeric IDs and all database fields.

**Example:**
```typescript
const clip = buildClipRecord({ title: 'My Clip' });
```

#### `buildClipRecordList(count: number, overrides?: Record<string, unknown>): Object[]`

Generate a list of Clip records with realistic variation.

**Example:**
```typescript
const clips = buildClipRecordList(10);
```

#### `buildClipWithStatus(status: ClipStatus, overrides?: Record<string, unknown>): Object`

Build a Clip record with a specific processing status.

**Supported statuses:**
- `pending`: Waiting to be processed
- `processing`: Currently being processed
- `completed`: Processing completed successfully
- `failed`: Processing failed
- `cancelled`: Processing was cancelled

**Example:**
```typescript
const completed = buildClipWithStatus('completed');
const failed = buildClipWithStatus('failed', {
  error: 'Failed to extract audio',
});
```

#### `buildClipWithNftStatus(nftStatus: NftStatus, overrides?: Record<string, unknown>): Object`

Build a Clip record with a specific NFT minting status.

**Supported statuses:**
- `none`: Not minted
- `minting`: Currently minting
- `minted`: Successfully minted
- `failed`: Minting failed

**Example:**
```typescript
// Unminted clip
const none = buildClipWithNftStatus('none');

// Clip being minted
const minting = buildClipWithNftStatus('minting');

// Minted clip with full NFT details
const minted = buildClipWithNftStatus('minted', {
  mintAddress: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEU4',
  metadataUri: 'ipfs://QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG',
});
```

#### `buildClipWithPostStatus(postStatusMap?: Record<string, unknown>, overrides?: Record<string, unknown>): Object`

Build a Clip record with social media posting status.

**Example:**
```typescript
// Posted to multiple platforms
const posted = buildClipWithPostStatus({
  instagram: { status: 'success', postId: 'insta-123' },
  tiktok: { status: 'success', postId: 'tt-456' },
  youtube: { status: 'pending' },
});

// Posted to TikTok but failed on Twitter
const partialFailure = buildClipWithPostStatus({
  tiktok: { status: 'success', postId: 'tt-789' },
  twitter: { status: 'failed', error: 'Rate limited' },
});
```

#### `buildClipWithEarning(overrides?: Record<string, unknown>): Object`

Build a Clip record with an associated earning record.

**Example:**
```typescript
const clip = buildClipWithEarning();
// Has earnings: [{ id: 1, clipId: 1, amount: 12.5, ... }]
```

#### `buildClipWithMultipleEarnings(count?: number, overrides?: Record<string, unknown>): Object`

Build a Clip record with multiple earning records across different dates.

**Example:**
```typescript
// Clip with 5 days of earnings
const clip = buildClipWithMultipleEarnings(5);

// Clip with 10 earnings for detailed reporting tests
const detailed = buildClipWithMultipleEarnings(10);
```

#### `buildClipVariant(variant?: 'trending' | 'niche' | 'viral' | 'lowPerforming', overrides?: Record<string, unknown>): Object`

Build a Clip with realistic variant data for UI testing and visual regression tests.

**Variants:**

- **trending**: High virality (88.5), posted to multiple platforms, selected
  ```typescript
  const trending = buildClipVariant('trending');
  ```

- **viral**: Highest virality (95.2), fully minted NFT, popular content
  ```typescript
  const viral = buildClipVariant('viral');
  ```

- **niche**: Low virality (32.1), not posted, niche audience
  ```typescript
  const niche = buildClipVariant('niche');
  ```

- **lowPerforming**: Very low virality (12.3), failed posting attempts
  ```typescript
  const flop = buildClipVariant('lowPerforming');
  ```

## Integration Test Example

```typescript
import {
  buildVideoRecord,
  buildVideoRecordList,
  buildClipRecordList,
  buildClipWithMultipleEarnings,
} from '../../test/fixtures';
import { PrismaService } from '@nestjs/prisma';

describe('Earnings Integration', () => {
  let prisma: PrismaService;

  beforeEach(async () => {
    // ... setup
    const video = await prisma.video.create({
      data: buildVideoRecord(),
    });

    const clips = await prisma.clip.createMany({
      data: buildClipRecordList(5, { videoId: video.id }),
    });
  });

  it('should calculate total earnings across clips', async () => {
    const clipWithEarnings = buildClipWithMultipleEarnings(10);
    // ... test logic
  });
});
```

## Unit Test Example

```typescript
import { buildClip, buildClipVariant } from '../../test/fixtures';

describe('Clip Service', () => {
  it('should calculate viral score correctly', () => {
    const clip = buildClip({ viralityScore: 85.5 });
    expect(service.isViral(clip)).toBe(true);
  });

  it('should handle different clip statuses', () => {
    const pending = buildClip({ status: 'pending' });
    const completed = buildClip({ status: 'completed' });

    expect(service.canPost(pending)).toBe(false);
    expect(service.canPost(completed)).toBe(true);
  });

  it('should render different variants correctly', () => {
    const variants = [
      buildClipVariant('trending'),
      buildClipVariant('viral'),
      buildClipVariant('niche'),
      buildClipVariant('lowPerforming'),
    ];

    variants.forEach((clip) => {
      expect(screen.getByText(clip.title)).toBeInTheDocument();
    });
  });
});
```

## Best Practices

1. **Use Sensible Defaults**: Only override fields you need to test. This keeps tests readable and maintainable.

   ```typescript
   // Good
   const clip = buildClip({ status: 'failed', error: 'Network error' });

   // Avoid
   const clip = buildClip({
     status: 'failed',
     error: 'Network error',
     viralityScore: 87.4, // Unnecessary override
     createdAt: new Date(),
   });
   ```

2. **Use Status Builders for Clarity**: When testing specific statuses, use the dedicated builders.

   ```typescript
   // Good
   const failed = buildClipWithStatus('failed');
   const minted = buildClipWithNftStatus('minted');

   // Less clear
   const failed = buildClip({ status: 'failed', error: 'Reason' });
   ```

3. **Leverage Variants for UI Tests**: Use variants for comprehensive UI and visual regression testing.

   ```typescript
   const variants = [
     buildClipVariant('trending'),
     buildClipVariant('viral'),
     buildClipVariant('niche'),
     buildClipVariant('lowPerforming'),
   ];
   ```

4. **Generate Realistic Data**: Use list builders to generate multiple records with variation.

   ```typescript
   // Good - creates varied, realistic data
   const videos = buildVideoRecordList(10);

   // Avoid - all data identical
   const videos = Array(10).fill(buildVideoRecord());
   ```

5. **Keep Fixtures in Sync**: When the schema changes, update the fixtures to reflect the new reality.

## Maintenance

When adding new fields to Video or Clip models:

1. Update the relevant fixture builder functions
2. Add new specialized builder functions if needed (e.g., `buildVideoWithNewField`)
3. Update this README with examples
4. Run tests to ensure fixtures generate valid data

## References

- [Video Entity](../../src/videos/video.entity.ts)
- [Clip Entity](../../src/clips/clip.entity.ts)
- [Prisma Schema](../../prisma/schema.prisma)
