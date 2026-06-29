import { BadRequestException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ClipsService } from './clips.service';

function makeService(clips: any[] = [], total?: number) {
  const prisma = {
    clip: {
      count: jest.fn().mockResolvedValue(total ?? clips.length),
      findMany: jest.fn().mockResolvedValue(clips),
    },
  };
  const service = new ClipsService(
    null as any,
    new EventEmitter2(),
    prisma as any,
    null as any,
    null as any,
  );
  return { service, prisma };
}

describe('ClipsService.listClips pagination', () => {
  it('returns paginated data with correct meta', async () => {
    const clips = [{ id: 1 }, { id: 2 }];
    const { service } = makeService(clips, 50);

    const result = await service.listClips({ page: 3, limit: 2 });

    expect(result.data).toEqual(clips);
    expect(result.meta).toEqual({ total: 50, page: 3, limit: 2, totalPages: 25 });
  });

  it('defaults to page=1 limit=20', async () => {
    const { service, prisma } = makeService([], 0);
    await service.listClips();
    expect(prisma.clip.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0, take: 20 }),
    );
  });

  it('returns empty data on last page with correct meta', async () => {
    const { service } = makeService([], 20);
    const result = await service.listClips({ page: 2, limit: 20 });
    expect(result.data).toEqual([]);
    expect(result.meta).toEqual({ total: 20, page: 2, limit: 20, totalPages: 1 });
  });

  it('returns totalPages=0 when there are no clips', async () => {
    const { service } = makeService([], 0);
    const result = await service.listClips({ page: 1, limit: 20 });
    expect(result.meta.totalPages).toBe(0);
  });

  it('throws 400 for limit > 100', async () => {
    const { service } = makeService();
    await expect(service.listClips({ limit: 101 })).rejects.toThrow(BadRequestException);
  });

  it('throws 400 for limit < 1', async () => {
    const { service } = makeService();
    await expect(service.listClips({ limit: 0 })).rejects.toThrow(BadRequestException);
  });

  it('throws 400 for negative limit', async () => {
    const { service } = makeService();
    await expect(service.listClips({ limit: -5 })).rejects.toThrow(BadRequestException);
  });

  it('throws 400 for page < 1', async () => {
    const { service } = makeService();
    await expect(service.listClips({ page: 0 })).rejects.toThrow(BadRequestException);
  });

  it('computes correct skip for page 2 limit 10', async () => {
    const { service, prisma } = makeService([], 100);
    await service.listClips({ page: 2, limit: 10 });
    expect(prisma.clip.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 10, take: 10 }),
    );
  });
});
