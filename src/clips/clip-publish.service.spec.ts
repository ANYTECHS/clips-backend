import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ClipPublishService } from './clip-publish.service';

const mockPrisma = {
  clip: { findUnique: jest.fn() },
  clipPost: {
    upsert: jest.fn(),
    create: jest.fn(),
    updateMany: jest.fn(),
    findMany: jest.fn(),
  },
};

const mockUserPlatformService = { findAll: jest.fn() };

/** Simulated BullMQ Queue */
const mockPostingQueue = {
  add: jest.fn(),
};

const mockQueueOverflowService = {
  enqueue: jest.fn(async ({ queue, jobName, data, baseOptions }) => {
    const job = await queue.add(jobName, data, baseOptions);
    return { jobId: job.id, delayed: false, delayMs: 0 };
  }),
};

const mockConfigService = {
  get: jest.fn((_key: string, defaultValue?: string) => defaultValue),
};

function makeService() {
  return new ClipPublishService(
    mockPrisma as any,
    mockUserPlatformService as any,
    mockPostingQueue as any,
    mockQueueOverflowService as any,
    mockConfigService as any,
  );
}

const clip = {
  id: 1,
  clipUrl: 'https://res.cloudinary.com/demo/video/upload/clip.mp4',
  caption: 'Test clip',
  title: 'Test',
};

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.clipPost.upsert.mockRejectedValue(new Error('no unique'));
  mockPrisma.clipPost.create.mockResolvedValue({});
  mockPostingQueue.add.mockResolvedValue({ id: 'job-42' });
});

describe('ClipPublishService.publish', () => {
  it('throws NotFoundException when clip does not exist', async () => {
    mockPrisma.clip.findUnique.mockResolvedValue(null);
    const svc = makeService();
    await expect(svc.publish(99, 1, ['tiktok'])).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws BadRequestException when clip has no clipUrl', async () => {
    mockPrisma.clip.findUnique.mockResolvedValue({ ...clip, clipUrl: null });
    const svc = makeService();
    await expect(svc.publish(1, 1, ['tiktok'])).rejects.toBeInstanceOf(BadRequestException);
  });

  it('throws BadRequestException when no requested platforms are connected', async () => {
    mockPrisma.clip.findUnique.mockResolvedValue(clip);
    mockUserPlatformService.findAll.mockResolvedValue([{ platform: 'instagram' }]);
    const svc = makeService();
    await expect(svc.publish(1, 1, ['tiktok'])).rejects.toBeInstanceOf(BadRequestException);
  });

  it('creates pending ClipPost rows and enqueues a posting job', async () => {
    mockPrisma.clip.findUnique.mockResolvedValue(clip);
    mockUserPlatformService.findAll.mockResolvedValue([
      { platform: 'tiktok' },
      { platform: 'instagram' },
    ]);

    const svc = makeService();
    const result = await svc.publish(1, 1, ['tiktok', 'instagram']);

    // Should have created two ClipPost rows (via .create fallback)
    expect(mockPrisma.clipPost.create).toHaveBeenCalledTimes(2);
    expect(mockPrisma.clipPost.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'pending', attempts: 0 }),
      }),
    );

    // Should enqueue exactly one posting job
    expect(mockPostingQueue.add).toHaveBeenCalledTimes(1);
    expect(mockPostingQueue.add).toHaveBeenCalledWith(
      'post-clip',
      expect.objectContaining({
        clipId: 1,
        userId: 1,
        mediaUrl: clip.clipUrl,
        platforms: ['tiktok', 'instagram'],
      }),
      expect.objectContaining({ attempts: 5 }),
    );

    // Returns the job ID immediately without waiting for Ayrshare
    expect(result.jobId).toBe('job-42');
    expect(result.platforms).toEqual(['tiktok', 'instagram']);
  });

  it('only enqueues connected platforms when targetPlatforms is a superset', async () => {
    mockPrisma.clip.findUnique.mockResolvedValue(clip);
    // User only has tiktok connected
    mockUserPlatformService.findAll.mockResolvedValue([{ platform: 'tiktok' }]);

    const svc = makeService();
    const result = await svc.publish(1, 1, ['tiktok', 'instagram']);

    expect(result.platforms).toEqual(['tiktok']);
    expect(mockPostingQueue.add).toHaveBeenCalledWith(
      'post-clip',
      expect.objectContaining({ platforms: ['tiktok'] }),
      expect.anything(),
    );
  });

  it('uses clip caption over title when both are present', async () => {
    mockPrisma.clip.findUnique.mockResolvedValue({ ...clip, caption: 'Custom caption' });
    mockUserPlatformService.findAll.mockResolvedValue([{ platform: 'tiktok' }]);

    const svc = makeService();
    await svc.publish(1, 1, ['tiktok']);

    expect(mockPostingQueue.add).toHaveBeenCalledWith(
      'post-clip',
      expect.objectContaining({ caption: 'Custom caption' }),
      expect.anything(),
    );
  });
});

describe('ClipPublishService.getPostStatus', () => {
  it('returns ClipPost records ordered by createdAt desc', async () => {
    const posts = [{ id: 1, platform: 'tiktok', status: 'published' }];
    mockPrisma.clipPost.findMany.mockResolvedValue(posts);

    const svc = makeService();
    const result = await svc.getPostStatus(1);

    expect(mockPrisma.clipPost.findMany).toHaveBeenCalledWith({
      where: { clipId: 1 },
      orderBy: { createdAt: 'desc' },
    });
    expect(result).toEqual(posts);
  });
});
