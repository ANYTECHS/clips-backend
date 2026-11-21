import { ClipPostingProcessor } from './clip-posting.processor';
import type { ClipPostingJob } from './clip-posting.queue';
import type { Job } from 'bullmq';

const mockPrisma = {
  clipPost: { findMany: jest.fn(), updateMany: jest.fn() },
};

const mockAyrshare = { post: jest.fn() };

const mockUserPlatformService = { findAll: jest.fn() };

const mockMetricsService = {
  recordJobStart: jest.fn(),
  recordJobCompletion: jest.fn(),
  recordJobFailure: jest.fn(),
};

const mockShutdownService = { register: jest.fn() };

function makeProcessor() {
  return new ClipPostingProcessor(
    mockPrisma as any,
    mockAyrshare as any,
    mockUserPlatformService as any,
    mockMetricsService as any,
    mockShutdownService as any,
  );
}

function makeJob(overrides: Partial<ClipPostingJob> = {}): Job<ClipPostingJob> {
  return {
    id: 'job-1',
    data: {
      clipId: 1,
      userId: 10,
      mediaUrl: 'https://cdn.example.com/clip.mp4',
      caption: 'Test caption',
      platforms: ['tiktok', 'instagram'],
      ...overrides,
    },
    opts: { attempts: 5 },
    attemptsMade: 0,
    updateProgress: jest.fn().mockResolvedValue(undefined),
  } as any;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.clipPost.findMany.mockImplementation(({ where }) =>
    Promise.resolve(
      where.platform.in.map((platform: string) => ({
        platform,
        status: 'pending',
      })),
    ),
  );
  mockPrisma.clipPost.updateMany.mockResolvedValue({ count: 1 });
});

describe('ClipPostingProcessor.process', () => {
  it('skips posting when user has no connected platforms', async () => {
    mockUserPlatformService.findAll.mockResolvedValue([]);
    const processor = makeProcessor();
    const job = makeJob();

    await processor.process(job);

    expect(mockAyrshare.post).not.toHaveBeenCalled();
    expect(mockPrisma.clipPost.updateMany).not.toHaveBeenCalled();
  });

  it('posts only to connected platforms', async () => {
    // User only has tiktok connected — instagram is in job data but not connected
    mockUserPlatformService.findAll.mockResolvedValue([{ platform: 'tiktok' }]);
    mockAyrshare.post.mockResolvedValue([
      { platform: 'tiktok', success: true, postId: 'tt-1' },
    ]);

    const processor = makeProcessor();
    const job = makeJob({ platforms: ['tiktok', 'instagram'] });

    await processor.process(job);

    expect(mockAyrshare.post).toHaveBeenCalledWith(
      job.data.mediaUrl,
      job.data.caption,
      ['tiktok'],
    );
  });

  it('updates ClipPost rows with "published" status on success', async () => {
    mockUserPlatformService.findAll.mockResolvedValue([
      { platform: 'tiktok' },
      { platform: 'instagram' },
    ]);
    mockAyrshare.post.mockResolvedValue([
      { platform: 'tiktok', success: true, postId: 'tt-1' },
      { platform: 'instagram', success: true, postId: 'ig-2' },
    ]);

    const processor = makeProcessor();
    const job = makeJob();

    await processor.process(job);

    expect(mockPrisma.clipPost.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { clipId: 1, platform: 'tiktok' },
        data: expect.objectContaining({ status: 'published', postId: 'tt-1' }),
      }),
    );
    expect(mockPrisma.clipPost.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { clipId: 1, platform: 'instagram' },
        data: expect.objectContaining({ status: 'published', postId: 'ig-2' }),
      }),
    );
  });

  it('updates failed ClipPost rows and throws after retries are exhausted', async () => {
    mockUserPlatformService.findAll.mockResolvedValue([{ platform: 'tiktok' }]);
    mockAyrshare.post.mockResolvedValue([
      { platform: 'tiktok', success: false, error: 'rate limited' },
    ]);

    const processor = makeProcessor();
    // Last attempt — no retries left — should not throw
    const job = makeJob({ platforms: ['tiktok'] });
    (job as any).attemptsMade = 4; // 5th attempt (0-indexed), no retries left
    (job as any).opts = { attempts: 5 };

    await expect(processor.process(job)).rejects.toThrow(/No retries remain/);

    expect(mockPrisma.clipPost.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { clipId: 1, platform: 'tiktok' },
        data: expect.objectContaining({
          status: 'failed',
          error: 'rate limited',
        }),
      }),
    );
  });

  it('throws when platforms fail and retries are still available', async () => {
    mockUserPlatformService.findAll.mockResolvedValue([{ platform: 'tiktok' }]);
    mockAyrshare.post.mockResolvedValue([
      { platform: 'tiktok', success: false, error: 'rate limited' },
    ]);

    const processor = makeProcessor();
    const job = makeJob({ platforms: ['tiktok'] });
    // attemptsMade=0 → 4 retries left → should throw for BullMQ to re-schedule
    await expect(processor.process(job)).rejects.toThrow(/retry/i);
  });

  it('retries only platforms that have not already been published', async () => {
    mockUserPlatformService.findAll.mockResolvedValue([
      { platform: 'tiktok' },
      { platform: 'instagram' },
    ]);
    mockAyrshare.post
      .mockResolvedValueOnce([
        { platform: 'tiktok', success: true, postId: 'tt-1' },
        { platform: 'instagram', success: false, error: 'rate limited' },
      ])
      .mockResolvedValueOnce([
        { platform: 'instagram', success: true, postId: 'ig-2' },
      ]);

    const processor = makeProcessor();
    const job = makeJob({ platforms: ['tiktok', 'instagram'] });
    await expect(processor.process(job)).rejects.toThrow(/retry/i);

    mockPrisma.clipPost.findMany.mockResolvedValue([
      { platform: 'tiktok', status: 'published' },
      { platform: 'instagram', status: 'failed' },
    ]);
    (job as any).attemptsMade = 1;
    await processor.process(job);

    expect(mockAyrshare.post).toHaveBeenNthCalledWith(
      2,
      job.data.mediaUrl,
      job.data.caption,
      ['instagram'],
    );
    expect(mockPrisma.clipPost.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { clipId: 1, platform: 'instagram' },
        data: expect.objectContaining({
          status: 'published',
          postId: 'ig-2',
          attempts: 2,
        }),
      }),
    );
  });
});
