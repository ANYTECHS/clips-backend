import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { LeaderboardService } from './leaderboard.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { ConfigService } from '../config/config.service';

describe('LeaderboardService', () => {
  let service: LeaderboardService;
  let prisma: {
    $queryRaw: jest.Mock;
    user: { findUnique: jest.Mock; update: jest.Mock };
    earning: { aggregate: jest.Mock };
  };
  let redis: {
    get: jest.Mock;
    setex: jest.Mock;
    del: jest.Mock;
    getClient: jest.Mock;
  };
  let config: { leaderboardEnabled: boolean };

  beforeEach(async () => {
    prisma = {
      $queryRaw: jest.fn(),
      user: { findUnique: jest.fn(), update: jest.fn() },
      earning: { aggregate: jest.fn() },
    };
    redis = {
      get: jest.fn().mockResolvedValue(null),
      setex: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(1),
      getClient: jest.fn().mockReturnValue({ keys: jest.fn().mockResolvedValue([]) }),
    };
    config = { leaderboardEnabled: true };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LeaderboardService,
        { provide: PrismaService, useValue: prisma },
        { provide: RedisService, useValue: redis },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();

    service = module.get(LeaderboardService);
  });

  it('throws when leaderboard is disabled', async () => {
    config.leaderboardEnabled = false;
    await expect(service.getLeaderboard()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('returns only opted-in creators with anonymized names by default', async () => {
    prisma.$queryRaw
      .mockResolvedValueOnce([
        {
          user_id: 10,
          name: 'Alice',
          email: 'alice@example.com',
          total_earnings: 1500,
        },
      ])
      .mockResolvedValueOnce([{ count: BigInt(1) }]);

    const result = await service.getLeaderboard({ page: 1, limit: 10 });

    expect(result.data).toHaveLength(1);
    expect(result.data[0].displayName).toBe('Creator #1');
    expect(result.data[0].userId).toBeNull();
    expect(result.data[0].anonymized).toBe(true);
    expect(result.data[0].totalEarnings).toBe(1500);
    expect(result.earningsExact).toBe(true);
    expect(result.page).toBe(1);
    expect(result.total).toBe(1);
    expect(redis.setex).toHaveBeenCalled();
  });

  it('returns real usernames when anonymize=false', async () => {
    prisma.$queryRaw
      .mockResolvedValueOnce([
        {
          user_id: 10,
          name: 'Alice',
          email: 'alice@example.com',
          total_earnings: 1500,
        },
      ])
      .mockResolvedValueOnce([{ count: BigInt(1) }]);

    const result = await service.getLeaderboard({ anonymize: false });

    expect(result.data[0].displayName).toBe('Alice');
    expect(result.data[0].userId).toBe(10);
    expect(result.data[0].anonymized).toBe(false);
  });

  it('serves cached leaderboard when available', async () => {
    const cached = {
      data: [],
      page: 1,
      limit: 20,
      total: 0,
      totalPages: 0,
      anonymize: true,
      earningsExact: true,
      updatedAt: new Date().toISOString(),
    };
    redis.get.mockResolvedValue(JSON.stringify(cached));

    const result = await service.getLeaderboard();
    expect(result).toEqual(cached);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('paginates with page and limit', async () => {
    prisma.$queryRaw
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ count: BigInt(45) }]);

    const result = await service.getLeaderboard({ page: 2, limit: 10 });

    expect(result.page).toBe(2);
    expect(result.limit).toBe(10);
    expect(result.total).toBe(45);
    expect(result.totalPages).toBe(5);
  });

  it('setLeaderboardVisibility updates opt-in and invalidates cache', async () => {
    prisma.user.update.mockResolvedValue({ showOnLeaderboard: true });
    redis.getClient.mockReturnValue({
      keys: jest.fn().mockResolvedValue(['leaderboard:p1:l20:a1:e0']),
    });

    const result = await service.setLeaderboardVisibility(7, true);

    expect(result.showOnLeaderboard).toBe(true);
    expect(redis.del).toHaveBeenCalled();
  });

  it('getUserRank throws for missing user', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(service.getUserRank(99)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
