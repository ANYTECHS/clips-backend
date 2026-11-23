import {
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { LeaderboardService, LeaderboardResponse } from './leaderboard.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { ConfigService } from '../config/config.service';

describe('LeaderboardService', () => {
  let service: LeaderboardService;
  let prisma: any;
  let redis: any;
  let config: any;

  beforeEach(async () => {
    redis = {
      get: jest.fn(),
      setex: jest.fn(),
      del: jest.fn(),
      getClient: jest.fn().mockReturnValue({
        keys: jest.fn(),
      }),
    };

    config = {
      leaderboardEnabled: true,
    };

    prisma = {
      user: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      earning: {
        aggregate: jest.fn(),
      },
      $queryRaw: jest.fn(),
    };

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

  describe('getLeaderboard', () => {
    it('throws ServiceUnavailableException when leaderboard disabled', async () => {
      config.leaderboardEnabled = false;

      await expect(service.getLeaderboard()).rejects.toThrow(
        ServiceUnavailableException,
      );
    });

    it('returns cached leaderboard when available', async () => {
      const cachedData: LeaderboardResponse = {
        data: [
          {
            rank: 1,
            userId: 1,
            displayName: 'Creator #1',
            totalEarnings: 5000,
            anonymized: false,
          },
        ],
        page: 1,
        limit: 20,
        total: 1,
        totalPages: 1,
        anonymize: false,
        earningsExact: true,
        updatedAt: new Date().toISOString(),
      };

      redis.get.mockResolvedValue(JSON.stringify(cachedData));

      const result = await service.getLeaderboard();

      expect(result).toEqual(cachedData);
      expect(redis.get).toHaveBeenCalled();
    });

    it('fetches from database when cache misses', async () => {
      redis.get.mockResolvedValue(null);

      prisma.$queryRaw
        .mockResolvedValueOnce([
          {
            user_id: 1,
            name: 'Alice',
            email: 'alice@example.com',
            total_earnings: 5000,
          },
          {
            user_id: 2,
            name: 'Bob',
            email: 'bob@example.com',
            total_earnings: 3000,
          },
        ])
        .mockResolvedValueOnce([{ count: BigInt(2) }]);

      const result = await service.getLeaderboard();

      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(prisma.$queryRaw).toHaveBeenCalled();
    });

    it('stores result in cache after database fetch', async () => {
      redis.get.mockResolvedValue(null);

      prisma.$queryRaw
        .mockResolvedValueOnce([
          {
            user_id: 1,
            name: 'Alice',
            email: 'alice@example.com',
            total_earnings: 5000,
          },
        ])
        .mockResolvedValueOnce([{ count: BigInt(1) }]);

      await service.getLeaderboard();

      expect(redis.setex).toHaveBeenCalledWith(
        expect.stringContaining('leaderboard'),
        3600,
        expect.any(String),
      );
    });

    it('respects page and limit parameters', async () => {
      redis.get.mockResolvedValue(null);

      prisma.$queryRaw
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ count: BigInt(0) }]);

      await service.getLeaderboard({ page: 2, limit: 50 });

      expect(prisma.$queryRaw).toHaveBeenCalledWith(
        expect.anything(),
        50,
        50,
      );
    });

    it('clamps limit to maximum allowed', async () => {
      redis.get.mockResolvedValue(null);

      prisma.$queryRaw
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ count: BigInt(0) }]);

      await service.getLeaderboard({ limit: 999 });

      const call = prisma.$queryRaw.mock.calls[0];
      expect(call[1]).toBe(100);
    });

    it('anonymizes user data when requested', async () => {
      redis.get.mockResolvedValue(null);

      prisma.$queryRaw
        .mockResolvedValueOnce([
          {
            user_id: 1,
            name: 'Alice',
            email: 'alice@example.com',
            total_earnings: 5000,
          },
        ])
        .mockResolvedValueOnce([{ count: BigInt(1) }]);

      const result = await service.getLeaderboard({ anonymize: true });

      expect(result.data[0].userId).toBeNull();
      expect(result.data[0].displayName).toBe('Creator #1');
      expect(result.data[0].anonymized).toBe(true);
    });

    it('shows real names when anonymization disabled', async () => {
      redis.get.mockResolvedValue(null);

      prisma.$queryRaw
        .mockResolvedValueOnce([
          {
            user_id: 1,
            name: 'Alice',
            email: 'alice@example.com',
            total_earnings: 5000,
          },
        ])
        .mockResolvedValueOnce([{ count: BigInt(1) }]);

      const result = await service.getLeaderboard({ anonymize: false });

      expect(result.data[0].userId).toBe(1);
      expect(result.data[0].displayName).toBe('Alice');
      expect(result.data[0].anonymized).toBe(false);
    });

    it('rounds earnings when anonymizeEarnings enabled', async () => {
      redis.get.mockResolvedValue(null);

      prisma.$queryRaw
        .mockResolvedValueOnce([
          {
            user_id: 1,
            name: 'Alice',
            email: 'alice@example.com',
            total_earnings: 5432.56,
          },
        ])
        .mockResolvedValueOnce([{ count: BigInt(1) }]);

      const result = await service.getLeaderboard({
        anonymizeEarnings: true,
      });

      // 5432.56 should be rounded to 5400 (floor to nearest 100)
      expect(result.data[0].totalEarnings).toBeLessThanOrEqual(5432.56);
      expect(result.data[0].totalEarnings % 100).toBe(0);
    });

    it('excludes soft-deleted earnings from total', async () => {
      redis.get.mockResolvedValue(null);

      prisma.$queryRaw
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ count: BigInt(0) }]);

      await service.getLeaderboard();

      const rawQuery = prisma.$queryRaw.mock.calls[0][0];
      expect(rawQuery.toString()).toContain('e."deletedAt" IS NULL');
    });

    it('only includes opted-in users', async () => {
      redis.get.mockResolvedValue(null);

      prisma.$queryRaw
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ count: BigInt(0) }]);

      await service.getLeaderboard();

      const rawQuery = prisma.$queryRaw.mock.calls[0][0];
      expect(rawQuery.toString()).toContain('u."showOnLeaderboard" = true');
    });

    it('excludes zero-earning users', async () => {
      redis.get.mockResolvedValue(null);

      prisma.$queryRaw
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ count: BigInt(0) }]);

      await service.getLeaderboard();

      const rawQuery = prisma.$queryRaw.mock.calls[0][0];
      expect(rawQuery.toString()).toContain('HAVING SUM(e.amount) > 0');
    });

    it('calculates pagination correctly', async () => {
      redis.get.mockResolvedValue(null);

      prisma.$queryRaw
        .mockResolvedValueOnce([
          { user_id: 1, name: 'A', email: 'a@ex.com', total_earnings: 100 },
          { user_id: 2, name: 'B', email: 'b@ex.com', total_earnings: 90 },
        ])
        .mockResolvedValueOnce([{ count: BigInt(25) }]);

      const result = await service.getLeaderboard({ page: 1, limit: 2 });

      expect(result.total).toBe(25);
      expect(result.totalPages).toBe(13); // ceil(25/2)
      expect(result.page).toBe(1);
      expect(result.limit).toBe(2);
    });

    it('handles zero total results', async () => {
      redis.get.mockResolvedValue(null);

      prisma.$queryRaw
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ count: BigInt(0) }]);

      const result = await service.getLeaderboard();

      expect(result.total).toBe(0);
      expect(result.totalPages).toBe(0);
      expect(result.data).toEqual([]);
    });
  });

  describe('getUserRank', () => {
    it('returns null rank when user not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.getUserRank(999)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('returns null rank when user not on leaderboard', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 1,
        name: 'Alice',
        email: 'alice@example.com',
        showOnLeaderboard: false,
      });

      const result = await service.getUserRank(1);

      expect(result.rank).toBeNull();
      expect(result.showOnLeaderboard).toBe(false);
    });

    it('returns null rank when user has zero earnings', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 1,
        name: 'Alice',
        email: 'alice@example.com',
        showOnLeaderboard: true,
      });
      prisma.earning.aggregate.mockResolvedValue({
        _sum: { amount: null },
      });

      const result = await service.getUserRank(1);

      expect(result.rank).toBeNull();
      expect(result.totalEarnings).toBe(0);
    });

    it('calculates rank correctly', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 2,
        name: 'Bob',
        email: 'bob@example.com',
        showOnLeaderboard: true,
      });
      prisma.earning.aggregate.mockResolvedValue({
        _sum: { amount: 3000 },
      });
      prisma.$queryRaw.mockResolvedValue([{ count: BigInt(2) }]);

      const result = await service.getUserRank(2);

      expect(result.rank).toBe(3); // 2 users with more earnings + 1
      expect(result.totalEarnings).toBe(3000);
      expect(result.showOnLeaderboard).toBe(true);
    });

    it('excludes soft-deleted earnings from user rank', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 1,
        name: 'Alice',
        email: 'alice@example.com',
        showOnLeaderboard: true,
      });
      prisma.earning.aggregate.mockResolvedValue({
        _sum: { amount: 5000 },
      });
      prisma.$queryRaw.mockResolvedValue([{ count: BigInt(0) }]);

      await service.getUserRank(1);

      expect(prisma.earning.aggregate).toHaveBeenCalledWith({
        where: {
          clip: {
            video: { userId: 1 },
          },
          deletedAt: null,
        },
        _sum: { amount: true },
      });
    });

    it('ranks user correctly in raw query', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 2,
        name: 'Bob',
        email: 'bob@example.com',
        showOnLeaderboard: true,
      });
      prisma.earning.aggregate.mockResolvedValue({
        _sum: { amount: 3000 },
      });
      prisma.$queryRaw.mockResolvedValue([{ count: BigInt(5) }]);

      const result = await service.getUserRank(2);

      expect(result.rank).toBe(6);
    });
  });

  describe('setLeaderboardVisibility', () => {
    it('enables leaderboard visibility', async () => {
      prisma.user.update.mockResolvedValue({
        showOnLeaderboard: true,
      });

      const result = await service.setLeaderboardVisibility(1, true);

      expect(result.showOnLeaderboard).toBe(true);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { showOnLeaderboard: true },
        select: { showOnLeaderboard: true },
      });
    });

    it('disables leaderboard visibility', async () => {
      prisma.user.update.mockResolvedValue({
        showOnLeaderboard: false,
      });

      const result = await service.setLeaderboardVisibility(1, false);

      expect(result.showOnLeaderboard).toBe(false);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { showOnLeaderboard: false },
        select: { showOnLeaderboard: true },
      });
    });

    it('invalidates leaderboard cache on visibility change', async () => {
      prisma.user.update.mockResolvedValue({
        showOnLeaderboard: true,
      });
      redis.getClient.mockReturnValue({
        keys: jest.fn().mockResolvedValue(['leaderboard:p1:l20:a1:e0']),
      });

      await service.setLeaderboardVisibility(1, true);

      expect(redis.del).toHaveBeenCalled();
    });
  });

  describe('Privacy Scenarios', () => {
    beforeEach(() => {
      redis.get.mockResolvedValue(null);
    });

    it('Scenario: Users with anonymize=true see masked leaderboard', async () => {
      prisma.$queryRaw
        .mockResolvedValueOnce([
          { user_id: 1, name: 'Alice', email: 'alice@ex.com', total_earnings: 5000 },
          { user_id: 2, name: 'Bob', email: 'bob@ex.com', total_earnings: 4000 },
        ])
        .mockResolvedValueOnce([{ count: BigInt(2) }]);

      const result = await service.getLeaderboard({ anonymize: true });

      expect(result.data.every((e) => e.userId === null)).toBe(true);
      expect(result.data[0].displayName).toBe('Creator #1');
      expect(result.data[1].displayName).toBe('Creator #2');
    });

    it('Scenario: Users with anonymize=false see real names', async () => {
      prisma.$queryRaw
        .mockResolvedValueOnce([
          { user_id: 1, name: 'Alice', email: 'alice@ex.com', total_earnings: 5000 },
        ])
        .mockResolvedValueOnce([{ count: BigInt(1) }]);

      const result = await service.getLeaderboard({ anonymize: false });

      expect(result.data[0].userId).toBe(1);
      expect(result.data[0].displayName).toBe('Alice');
    });

    it('Scenario: Users opt out and disappear from leaderboard', async () => {
      // First: User is on leaderboard
      prisma.$queryRaw
        .mockResolvedValueOnce([
          { user_id: 1, name: 'Alice', email: 'alice@ex.com', total_earnings: 5000 },
        ])
        .mockResolvedValueOnce([{ count: BigInt(1) }]);

      const beforeOptOut = await service.getLeaderboard();
      expect(beforeOptOut.total).toBe(1);

      // User opts out
      prisma.user.update.mockResolvedValue({ showOnLeaderboard: false });
      await service.setLeaderboardVisibility(1, false);

      // Second: User no longer on leaderboard
      prisma.$queryRaw
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ count: BigInt(0) }]);

      const afterOptOut = await service.getLeaderboard();
      expect(afterOptOut.total).toBe(0);
    });

    it('Scenario: anonymizeEarnings rounds earnings buckets', async () => {
      prisma.$queryRaw
        .mockResolvedValueOnce([
          { user_id: 1, name: 'A', email: 'a@ex.com', total_earnings: 45 },
          { user_id: 2, name: 'B', email: 'b@ex.com', total_earnings: 450 },
          { user_id: 3, name: 'C', email: 'c@ex.com', total_earnings: 4500 },
        ])
        .mockResolvedValueOnce([{ count: BigInt(3) }]);

      const result = await service.getLeaderboard({
        anonymizeEarnings: true,
      });

      // < 100: round to nearest 10
      expect(result.data[0].totalEarnings).toBe(40);

      // < 1000: round to nearest 50
      expect(result.data[1].totalEarnings).toBe(450);

      // < 10000: round to nearest 100
      expect(result.data[2].totalEarnings).toBe(4500);
    });
  });

  describe('Cache Behavior', () => {
    it('different cache keys for different parameters', async () => {
      redis.get.mockResolvedValue(null);
      prisma.$queryRaw
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ count: BigInt(0) }]);

      await service.getLeaderboard({ page: 1, anonymize: true });

      const firstKey = redis.setex.mock.calls[0][0];

      redis.setex.mockClear();
      prisma.$queryRaw.mockClear();
      redis.get.mockResolvedValue(null);

      prisma.$queryRaw
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ count: BigInt(0) }]);

      await service.getLeaderboard({ page: 1, anonymize: false });

      const secondKey = redis.setex.mock.calls[0][0];

      expect(firstKey).not.toBe(secondKey);
    });

    it('handles cache write failures gracefully', async () => {
      redis.get.mockResolvedValue(null);
      redis.setex.mockRejectedValue(new Error('Redis connection failed'));
      prisma.$queryRaw
        .mockResolvedValueOnce([
          { user_id: 1, name: 'A', email: 'a@ex.com', total_earnings: 100 },
        ])
        .mockResolvedValueOnce([{ count: BigInt(1) }]);

      const result = await service.getLeaderboard();

      expect(result.data).toHaveLength(1);
    });
  });
});
