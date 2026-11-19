/**
 * Integration tests for the Ayrshare posting queue (#272).
 *
 * Verifies that ClipPostingProcessor correctly:
 *  - Mocks the Ayrshare SDK and processes jobs end-to-end
 *  - Handles multi-platform posting (success + partial failure)
 *  - Persists results to the DB via Prisma
 *  - Retries on failure and gives up gracefully on final attempt
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ClipPostingProcessor } from './clip-posting.processor';
import { PrismaService } from '../prisma/prisma.service';
import { AyrshareService } from './ayrshare.service';
import { UserPlatformService } from '../user-platform/user-platform.service';
import { MetricsService } from '../metrics/metrics.service';
import type { Job } from 'bullmq';
import type { ClipPostingJob } from './clip-posting.queue';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockPrisma = {
  clipPost: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
};

const mockAyrshare = { post: jest.fn() };

const mockUserPlatformService = { findAll: jest.fn() };

const mockMetrics = {
  recordJobStart: jest.fn(),
  recordJobCompletion: jest.fn(),
  recordJobFailure: jest.fn(),
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeJob(
  overrides: Partial<ClipPostingJob> = {},
  jobOverrides: Partial<Job> = {},
): Job<ClipPostingJob> {
  return {
    id: 'job-integration-1',
    data: {
      clipId: 42,
      userId: 7,
      mediaUrl: 'https://cdn.example.com/clip-42.mp4',
      caption: '#viral clip',
      platforms: ['tiktok', 'instagram', 'youtube'],
      ...overrides,
    },
    opts: { attempts: 5 },
    attemptsMade: 0,
    updateProgress: jest.fn().mockResolvedValue(undefined),
    ...jobOverrides,
  } as any;
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('Ayrshare posting queue — integration', () => {
  let processor: ClipPostingProcessor;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClipPostingProcessor,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AyrshareService, useValue: mockAyrshare },
        { provide: UserPlatformService, useValue: mockUserPlatformService },
        { provide: MetricsService, useValue: mockMetrics },
      ],
    }).compile();

    processor = module.get(ClipPostingProcessor);
  });

  // ── No connected platforms ─────────────────────────────────────────────────

  it('skips Ayrshare call when user has no connected platforms', async () => {
    mockUserPlatformService.findAll.mockResolvedValue([]);

    await processor.process(makeJob());

    expect(mockAyrshare.post).not.toHaveBeenCalled();
    expect(mockPrisma.clipPost.updateMany).not.toHaveBeenCalled();
    expect(mockMetrics.recordJobCompletion).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      'success',
    );
  });

  // ── Multi-platform success ─────────────────────────────────────────────────

  it('posts to all connected platforms and marks each as published', async () => {
    mockUserPlatformService.findAll.mockResolvedValue([
      { platform: 'tiktok' },
      { platform: 'instagram' },
      { platform: 'youtube' },
    ]);
    mockAyrshare.post.mockResolvedValue([
      { platform: 'tiktok', success: true, postId: 'tt-100' },
      { platform: 'instagram', success: true, postId: 'ig-200' },
      { platform: 'youtube', success: true, postId: 'yt-300' },
    ]);

    const job = makeJob();
    await processor.process(job);

    expect(mockAyrshare.post).toHaveBeenCalledWith(
      job.data.mediaUrl,
      job.data.caption,
      ['tiktok', 'instagram', 'youtube'],
    );

    for (const [platform, postId] of [
      ['tiktok', 'tt-100'],
      ['instagram', 'ig-200'],
      ['youtube', 'yt-300'],
    ]) {
      expect(mockPrisma.clipPost.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { clipId: 42, platform },
          data: expect.objectContaining({ status: 'published', postId }),
        }),
      );
    }
  });

  // ── Partial failure with retries remaining ─────────────────────────────────

  it('throws to trigger BullMQ retry when some platforms fail and retries remain', async () => {
    mockUserPlatformService.findAll.mockResolvedValue([
      { platform: 'tiktok' },
      { platform: 'instagram' },
    ]);
    mockAyrshare.post.mockResolvedValue([
      { platform: 'tiktok', success: true, postId: 'tt-1' },
      { platform: 'instagram', success: false, error: 'rate limited' },
    ]);

    const job = makeJob({ platforms: ['tiktok', 'instagram'] });
    // attemptsMade=0 → 4 retries left → must throw
    await expect(processor.process(job)).rejects.toThrow(/retry/i);

    // Successful platform is still persisted before the throw
    expect(mockPrisma.clipPost.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { clipId: 42, platform: 'tiktok' },
        data: expect.objectContaining({ status: 'published' }),
      }),
    );
    expect(mockPrisma.clipPost.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { clipId: 42, platform: 'instagram' },
        data: expect.objectContaining({ status: 'failed', error: 'rate limited' }),
      }),
    );
  });

  // ── Final attempt — no more retries ───────────────────────────────────────

  it('does not throw on final attempt even when platforms fail', async () => {
    mockUserPlatformService.findAll.mockResolvedValue([{ platform: 'tiktok' }]);
    mockAyrshare.post.mockResolvedValue([
      { platform: 'tiktok', success: false, error: 'account suspended' },
    ]);

    const job = makeJob({ platforms: ['tiktok'] }, { attemptsMade: 4, opts: { attempts: 5 } } as any);
    await expect(processor.process(job)).resolves.toBeUndefined();

    expect(mockPrisma.clipPost.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'failed', error: 'account suspended' }),
      }),
    );
  });

  // ── Platform filtering ─────────────────────────────────────────────────────

  it('only posts to platforms the user has connected (filters job data)', async () => {
    // User connected only tiktok; job requests tiktok + instagram + youtube
    mockUserPlatformService.findAll.mockResolvedValue([{ platform: 'tiktok' }]);
    mockAyrshare.post.mockResolvedValue([
      { platform: 'tiktok', success: true, postId: 'tt-99' },
    ]);

    const job = makeJob({ platforms: ['tiktok', 'instagram', 'youtube'] });
    await processor.process(job);

    expect(mockAyrshare.post).toHaveBeenCalledWith(
      job.data.mediaUrl,
      job.data.caption,
      ['tiktok'],
    );
    // Only one updateMany call (for tiktok)
    expect(mockPrisma.clipPost.updateMany).toHaveBeenCalledTimes(1);
  });

  // ── Metrics ───────────────────────────────────────────────────────────────

  it('records job start and completion metrics', async () => {
    mockUserPlatformService.findAll.mockResolvedValue([{ platform: 'tiktok' }]);
    mockAyrshare.post.mockResolvedValue([
      { platform: 'tiktok', success: true, postId: 'tt-1' },
    ]);

    await processor.process(makeJob({ platforms: ['tiktok'] }));

    expect(mockMetrics.recordJobStart).toHaveBeenCalled();
    expect(mockMetrics.recordJobCompletion).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      'success',
    );
  });

  it('records failure metric when Ayrshare throws', async () => {
    mockUserPlatformService.findAll.mockResolvedValue([{ platform: 'tiktok' }]);
    mockAyrshare.post.mockRejectedValue(new Error('Network error'));

    const job = makeJob({ platforms: ['tiktok'] });
    await expect(processor.process(job)).rejects.toThrow('Network error');

    expect(mockMetrics.recordJobCompletion).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      'failure',
    );
  });
});
