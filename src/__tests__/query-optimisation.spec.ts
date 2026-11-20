/**
 * Query optimisation tests — Issue #866
 *
 * Verifies that list endpoints use selective `select` clauses and never issue
 * broad `include: { relation: true }` statements that load all relation fields.
 */

import { EventEmitter2 } from '@nestjs/event-emitter';
import { BadRequestException } from '@nestjs/common';
import { ClipsService } from '../clips/clips.service';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeClipsService(clips: any[] = [], total = 0) {
  const prisma = {
    clip: {
      count: jest.fn().mockResolvedValue(total),
      findMany: jest.fn().mockResolvedValue(clips),
    },
  };
  const service = new ClipsService(
    prisma as any,
    null as any,
    new EventEmitter2(),
    null as any,
  );
  return { service, prisma };
}

// ─── ClipsService.listClips — select discipline ───────────────────────────────

describe('ClipsService.listClips query optimisation', () => {
  it('uses select instead of include on the clip query', async () => {
    const { service, prisma } = makeClipsService([], 0);
    await service.listClips();

    const call = prisma.clip.findMany.mock.calls[0][0];

    // Must have a select clause
    expect(call).toHaveProperty('select');

    // Must NOT have a top-level include clause (which would load all relation fields)
    expect(call).not.toHaveProperty('include');
  });

  it('does not select large/unnecessary relation fields by default', async () => {
    const { service, prisma } = makeClipsService([], 0);
    await service.listClips();

    const call = prisma.clip.findMany.mock.calls[0][0];
    const selectedFields = Object.keys(call.select ?? {});

    // The select should not pull in full relation objects
    expect(selectedFields).not.toContain('video');
    expect(selectedFields).not.toContain('clipPosts');
    expect(selectedFields).not.toContain('earnings');
  });

  it('selects exactly the documented clip fields', async () => {
    const { service, prisma } = makeClipsService([], 0);
    await service.listClips();

    const { select } = prisma.clip.findMany.mock.calls[0][0];

    const requiredFields = [
      'id', 'videoId', 'clipUrl', 'thumbnail', 'title', 'caption',
      'startTime', 'endTime', 'duration', 'viralityScore', 'selected',
      'postStatus', 'nftStatus', 'status', 'createdAt', 'updatedAt',
    ];

    for (const field of requiredFields) {
      expect(select).toHaveProperty(field, true);
    }
  });

  it('paginates: skip and take are passed to prisma', async () => {
    const { service, prisma } = makeClipsService([], 100);
    await service.listClips({ page: 3, limit: 10 });

    const call = prisma.clip.findMany.mock.calls[0][0];
    expect(call.skip).toBe(20);
    expect(call.take).toBe(10);
  });

  it('runs count and findMany in parallel (both called once)', async () => {
    const { service, prisma } = makeClipsService([], 5);
    await service.listClips({ page: 1, limit: 5 });

    expect(prisma.clip.count).toHaveBeenCalledTimes(1);
    expect(prisma.clip.findMany).toHaveBeenCalledTimes(1);
  });

  it('filters by videoId when provided', async () => {
    const { service, prisma } = makeClipsService([], 0);
    await service.listClips({ videoId: '42' });

    const call = prisma.clip.findMany.mock.calls[0][0];
    expect(call.where).toEqual({ videoId: 42 });
  });

  it('sorts by viralityScore with nulls last and createdAt tie-breaker', async () => {
    const { service, prisma } = makeClipsService([], 0);
    await service.listClips({ sortBy: 'viralityScore', order: 'desc' });

    const call = prisma.clip.findMany.mock.calls[0][0];
    expect(call.orderBy).toEqual([
      { viralityScore: { sort: 'desc', nulls: 'last' } },
      { createdAt: 'desc' },
    ]);
  });

  it('defaults to createdAt desc when no sortBy provided', async () => {
    const { service, prisma } = makeClipsService([], 0);
    await service.listClips();

    const call = prisma.clip.findMany.mock.calls[0][0];
    expect(call.orderBy).toEqual([{ createdAt: 'desc' }]);
  });

  it('throws BadRequestException for limit > 100', async () => {
    const { service } = makeClipsService();
    await expect(service.listClips({ limit: 101 })).rejects.toThrow(BadRequestException);
  });

  it('throws BadRequestException for limit < 1', async () => {
    const { service } = makeClipsService();
    await expect(service.listClips({ limit: 0 })).rejects.toThrow(BadRequestException);
  });

  it('throws BadRequestException for page < 1', async () => {
    const { service } = makeClipsService();
    await expect(service.listClips({ page: 0 })).rejects.toThrow(BadRequestException);
  });

  it('returns correct pagination meta', async () => {
    const { service } = makeClipsService(
      [{ id: 1 }, { id: 2 }],
      47,
    );
    const result = await service.listClips({ page: 2, limit: 10 });
    expect(result.meta).toEqual({ total: 47, page: 2, limit: 10, totalPages: 5 });
  });

  it('returns totalPages=0 when there are no clips', async () => {
    const { service } = makeClipsService([], 0);
    const result = await service.listClips();
    expect(result.meta.totalPages).toBe(0);
  });
});
