import { ForbiddenException, BadRequestException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ClipsService } from './clips.service';
import { Clip } from './clip.entity';
import { ALL_CLIPS_PROCESSED_EVENT } from './clips.events';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeClip(overrides: Partial<Clip> = {}): any {
  return {
    id: 1,
    videoId: 1,
    userId: 1,
    startTime: 0,
    endTime: 30,
    duration: 30,
    positionRatio: 0.5,
    viralityScore: 80,
    selected: false,
    postStatus: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeService() {
  const emitter = new EventEmitter2();
  jest.spyOn(emitter, 'emit');
  const prisma = {
    clip: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };
  // ClipGenerationProcessor not needed for bulk-update tests
  const service = new ClipsService(null as any, emitter, prisma as any, null as any, null as any, null as any, null as any);
  return { service, emitter, prisma };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ClipsService.bulkUpdate', () => {
  it('updates selected flag for valid clips', async () => {
    const { service, prisma } = makeService();
    const clip1 = makeClip({ id: 1 });
    const clip2 = makeClip({ id: 2 });
    service._seed([clip1, clip2]);

    // Mock findById which now uses prisma
    prisma.clip.findUnique.mockImplementation(({ where }) => {
      if (where.id === 1) return Promise.resolve(clip1);
      if (where.id === 2) return Promise.resolve(clip2);
      return Promise.resolve(null);
    });

    const result = await service.bulkUpdate(1 as any, {
      clipIds: [1, 2],
      updates: { selected: true },
    });

    expect(result.updatedCount).toBe(2);
    expect(result.notFoundIds).toHaveLength(0);
    expect((await service.findById(1))!.selected).toBe(true);
    expect((await service.findById(2))!.selected).toBe(true);
  });

  it('updates postStatus for valid clips', async () => {
    const { service, prisma } = makeService();
    const clip1 = makeClip({ id: 1 });
    service._seed([clip1]);

    prisma.clip.findUnique.mockResolvedValue(clip1);

    await service.bulkUpdate(1 as any, {
      clipIds: [1],
      updates: { postStatus: 'posted' },
    });

    expect((await service.findById(1))!.postStatus).toBe('posted');
  });

  it('accepts JSON object as postStatus', async () => {
    const { service, prisma } = makeService();
    const clip1 = makeClip({ id: 1 });
    service._seed([clip1]);
    prisma.clip.findUnique.mockResolvedValue(clip1);
    const status = { platform: 'tiktok', postId: 'abc', status: 'posted' };

    await service.bulkUpdate(1 as any, { clipIds: [1], updates: { postStatus: status } });

    expect((await service.findById(1))!.postStatus).toEqual(status);
  });

  it('collects notFoundIds for missing clips', async () => {
    const { service, prisma } = makeService();
    const clip1 = makeClip({ id: 1 });
    service._seed([clip1]);
    prisma.clip.findUnique.mockImplementation(({ where }) => {
      if (where.id === 1) return Promise.resolve(clip1);
      return Promise.resolve(null);
    });

    const result = await service.bulkUpdate(1 as any, {
      clipIds: [1, 999],
      updates: { selected: true },
    });

    expect(result.updatedCount).toBe(1);
    expect(result.notFoundIds).toEqual([999]);
  });

  it('treats clips belonging to another user as not-found (no info leak)', async () => {
    const { service, prisma } = makeService();
    const clip1 = makeClip({ id: 1, userId: 2 });
    service._seed([clip1]);
    prisma.clip.findUnique.mockResolvedValue(clip1);

    // All requested IDs are owned by another user → ForbiddenException
    await expect(
      service.bulkUpdate(1 as any, { clipIds: [1], updates: { selected: true } }),
    ).rejects.toThrow(ForbiddenException);

    // Clip must NOT have been mutated
    expect((await service.findById(1))!.selected).toBe(false);
  });

  it('throws ForbiddenException when no valid clips found', async () => {
    const { service } = makeService();

    await expect(
      service.bulkUpdate(1 as any, { clipIds: [999], updates: { selected: true } }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('throws BadRequestException when neither selected nor postStatus provided', async () => {
    const { service } = makeService();
    service._seed([makeClip({ id: 1 })]);

    await expect(
      service.bulkUpdate(1 as any, { clipIds: [1], updates: {} }),
    ).rejects.toThrow(BadRequestException);
  });

  it('emits allClipsProcessed event when every clip in a video is posted', async () => {
    const { service, emitter } = makeService();
    service._seed([
      makeClip({ id: 1, videoId: 1, postStatus: 'posted' }),
      makeClip({ id: 2, videoId: 1, postStatus: null }),
    ]);

    const result = await service.bulkUpdate(1 as any, {
      clipIds: [2],
      updates: { postStatus: 'posted' },
    });

    expect(result.allClipsProcessed).toBe(true);
    expect(emitter.emit).toHaveBeenCalledWith(ALL_CLIPS_PROCESSED_EVENT, {
      videoId: '1',
      clipCount: 2,
    });
  });

  it('does NOT emit event when some clips in the video are still unprocessed', async () => {
    const { service, emitter } = makeService();
    service._seed([
      makeClip({ id: 1, videoId: 1, postStatus: null }),
      makeClip({ id: 2, videoId: 1, postStatus: null }),
    ]);

    const result = await service.bulkUpdate(1 as any, {
      clipIds: [1],
      updates: { postStatus: 'posted' },
    });

    expect(result.allClipsProcessed).toBe(false);
    expect(emitter.emit).not.toHaveBeenCalled();
  });

  it('returns the applied updates summary', async () => {
    const { service } = makeService();
    service._seed([makeClip({ id: 1 })]);

    const result = await service.bulkUpdate(1 as any, {
      clipIds: [1],
      updates: {
        selected: true,
        postStatus: 'pending',
      },
    });

    expect(result.updates).toEqual({ selected: true, postStatus: 'pending' });
  });
});
