import { ClipRepository } from './clip.repository';
import { EarningRepository } from './earning.repository';
import { PayoutRepository } from './payout.repository';
import { UserRepository } from './user.repository';

function makePrisma() {
  return {
    clip: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn(), count: jest.fn().mockResolvedValue(0) },
    earning: { aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 5 } }), findMany: jest.fn().mockResolvedValue([]) },
    payout: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn(), count: jest.fn().mockResolvedValue(0) },
    user: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
  };
}

describe('prisma repositories (Issue #1237)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('ClipRepository.list paginates with shared select and keeps skip/take math', async () => {
    const prisma = makePrisma();
    const repo = new ClipRepository(prisma as never);
    await repo.list({ videoId: 1 }, { createdAt: 'desc' }, 2, 10);
    expect(prisma.clip.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 10, take: 10 }),
    );
    expect(prisma.clip.count).toHaveBeenCalled();
  });

  it('EarningRepository builds the canonical ownership filter', async () => {
    const prisma = makePrisma();
    const repo = new EarningRepository(prisma as never);
    expect(repo.whereForUser(9)).toEqual({ clip: { video: { userId: 9 } }, deletedAt: null });
    await repo.sumForUser(9);
    expect(prisma.earning.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { clip: { video: { userId: 9 } }, deletedAt: null } }),
    );
  });

  it('PayoutRepository.list paginates without altering response shape', async () => {
    const prisma = makePrisma();
    const repo = new PayoutRepository(prisma as never);
    const result = await repo.list({ userId: 4 }, 1, 20);
    expect(result).toMatchObject({ total: 0, page: 1, limit: 20 });
    expect(prisma.payout.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { createdAt: 'desc' } }),
    );
  });

  it('UserRepository.list still paginates via the shared helper', async () => {
    const prisma = makePrisma();
    const repo = new UserRepository(prisma as never);
    const result = await repo.list({}, 1, 20);
    expect(result).toMatchObject({ total: 0, page: 1 });
  });
});
