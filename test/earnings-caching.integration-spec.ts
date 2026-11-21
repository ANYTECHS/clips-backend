import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { EarningsService } from '../src/earnings/earnings.service';
import { EarningsCacheService } from '../src/earnings/earnings-cache.service';
import { RedisService } from '../src/redis/redis.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { CurrencyService } from '../src/common/services/currency.service';

/**
 * Integration tests for earnings caching:
 * - Cache hits reduce database queries
 * - Cache misses fall back to PostgreSQL
 * - Cache invalidation works correctly
 * - Redis failures don't break earnings fetching
 */
describe('Earnings Caching Integration', () => {
  let app: INestApplication;
  let service: EarningsService;
  let cache: EarningsCacheService;
  let redis: RedisService;
  let prisma: PrismaService;
  let eventEmitter: EventEmitter2;

  beforeAll(async () => {
    const mockPrisma = {
      earning: { aggregate: jest.fn() },
      payout: { aggregate: jest.fn() },
      clip: { findUnique: jest.fn() },
    };

    const mockRedis = {
      get: jest.fn(),
      setex: jest.fn(),
      del: jest.fn(),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      providers: [
        EarningsService,
        EarningsCacheService,
        { provide: RedisService, useValue: mockRedis },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        { provide: CurrencyService, useValue: { getBaseCurrency: () => 'USD', validateCurrency: () => {} } },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    service = moduleFixture.get<EarningsService>(EarningsService);
    cache = moduleFixture.get<EarningsCacheService>(EarningsCacheService);
    redis = moduleFixture.get<RedisService>(RedisService);
    prisma = moduleFixture.get<PrismaService>(PrismaService);
    eventEmitter = moduleFixture.get<EventEmitter2>(EventEmitter2);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Cache Hit Performance', () => {
    it('should return cached summary without database queries', async () => {
      const userId = 1;
      const cachedSummary = {
        totalEarned: 1000,
        totalPaidOut: 200,
        availableBalance: 800,
        currency: 'USD',
      };

      jest.spyOn(redis, 'get').mockResolvedValue(JSON.stringify(cachedSummary));

      const result = await service.getUserTotalEarnings(userId);

      expect(result).toEqual(cachedSummary);
      expect(redis.get).toHaveBeenCalledWith(`earnings:total:${userId}`);
      expect(prisma.earning.aggregate).not.toHaveBeenCalled();
    });

    it('should return cached total without database queries', async () => {
      const userId = 2;
      const cachedTotal = { total: 5000.75, currency: 'USD' };

      jest.spyOn(redis, 'get').mockResolvedValue(JSON.stringify(cachedTotal));

      const result = await service.getUserTotalEarningsCached(userId);

      expect(result).toEqual(cachedTotal);
      expect(redis.get).toHaveBeenCalledWith(`earnings:user:${userId}:total`);
      expect(prisma.earning.aggregate).not.toHaveBeenCalled();
    });
  });

  describe('Cache Miss and Population', () => {
    it('should query database on cache miss and populate cache', async () => {
      const userId = 3;

      jest.spyOn(redis, 'get').mockResolvedValue(null);
      jest.spyOn(prisma.earning, 'aggregate').mockResolvedValue({
        _sum: { amountInBaseCurrency: 3000 },
      });
      jest.spyOn(prisma.payout, 'aggregate').mockResolvedValue({
        _sum: { amount: 500 },
      });
      jest.spyOn(redis, 'setex').mockResolvedValue(undefined);

      const result = await service.getUserTotalEarnings(userId);

      expect(result.totalEarned).toBe(3000);
      expect(result.totalPaidOut).toBe(500);
      expect(result.availableBalance).toBe(2500);
      expect(redis.setex).toHaveBeenCalled();
    });

    it('should handle zero aggregate values', async () => {
      const userId = 4;

      jest.spyOn(redis, 'get').mockResolvedValue(null);
      jest.spyOn(prisma.earning, 'aggregate').mockResolvedValue({
        _sum: { amountInBaseCurrency: null },
      });
      jest.spyOn(prisma.payout, 'aggregate').mockResolvedValue({
        _sum: { amount: null },
      });

      const result = await service.getUserTotalEarnings(userId);

      expect(result.totalEarned).toBe(0);
      expect(result.totalPaidOut).toBe(0);
      expect(result.availableBalance).toBe(0);
    });
  });

  describe('Cache Invalidation', () => {
    it('should invalidate cache when new earning is created', async () => {
      const userId = 5;
      const clipId = 100;

      jest.spyOn(prisma.earning, 'create').mockResolvedValue({
        id: 1,
        clipId,
        amount: 50,
        currency: 'USD',
        amountInBaseCurrency: 50,
        exchangeRate: 1,
        date: new Date(),
        source: 'test',
      });

      jest.spyOn(prisma.clip, 'findUnique').mockResolvedValue({
        id: clipId,
        video: { userId },
      });

      jest.spyOn(redis, 'del').mockResolvedValue(2);
      jest.spyOn(eventEmitter, 'emit');

      await service.createEarning({
        clipId,
        amount: 50,
        date: new Date(),
        source: 'test',
      });

      expect(redis.del).toHaveBeenCalledWith(
        `earnings:total:${userId}`,
        `earnings:user:${userId}:total`,
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'earnings.updated',
        expect.objectContaining({ userId, earningId: 1 }),
      );
    });

    it('should remove both cache keys on invalidate', async () => {
      const userId = 6;

      jest.spyOn(redis, 'del').mockResolvedValue(2);

      await cache.invalidate(userId);

      expect(redis.del).toHaveBeenCalledWith(
        `earnings:total:${userId}`,
        `earnings:user:${userId}:total`,
      );
    });
  });

  describe('Redis Failure Resilience', () => {
    it('should fall back to database when Redis get fails', async () => {
      const userId = 7;

      jest.spyOn(redis, 'get').mockRejectedValue(new Error('Connection refused'));
      jest.spyOn(prisma.earning, 'aggregate').mockResolvedValue({
        _sum: { amountInBaseCurrency: 2000 },
      });
      jest.spyOn(prisma.payout, 'aggregate').mockResolvedValue({
        _sum: { amount: 400 },
      });

      const result = await service.getUserTotalEarnings(userId);

      expect(result.totalEarned).toBe(2000);
      expect(result.totalPaidOut).toBe(400);
      expect(result.availableBalance).toBe(1600);
    });

    it('should continue when cache set fails', async () => {
      const userId = 8;

      jest.spyOn(redis, 'get').mockResolvedValue(null);
      jest.spyOn(redis, 'setex').mockRejectedValue(new Error('Redis down'));
      jest.spyOn(prisma.earning, 'aggregate').mockResolvedValue({
        _sum: { amountInBaseCurrency: 1500 },
      });
      jest.spyOn(prisma.payout, 'aggregate').mockResolvedValue({
        _sum: { amount: 300 },
      });

      const result = await service.getUserTotalEarnings(userId);

      expect(result.totalEarned).toBe(1500);
      expect(result.availableBalance).toBe(1200);
    });

    it('should continue when cache invalidation fails', async () => {
      const userId = 9;
      const clipId = 101;

      jest.spyOn(redis, 'del').mockRejectedValue(new Error('Redis down'));
      jest.spyOn(prisma.earning, 'create').mockResolvedValue({
        id: 2,
        clipId,
        amount: 75,
        currency: 'USD',
        amountInBaseCurrency: 75,
        exchangeRate: 1,
        date: new Date(),
        source: 'test',
      });

      jest.spyOn(prisma.clip, 'findUnique').mockResolvedValue({
        id: clipId,
        video: { userId },
      });

      // Should not throw, even though invalidation fails
      await expect(
        service.createEarning({
          clipId,
          amount: 75,
          date: new Date(),
          source: 'test',
        }),
      ).resolves.toBeDefined();
    });
  });

  describe('TTL Configuration', () => {
    it('should use configured TTL when setting cache', async () => {
      const userId = 10;
      const summary = {
        totalEarned: 500,
        totalPaidOut: 100,
        availableBalance: 400,
        currency: 'USD',
      };

      jest.spyOn(redis, 'setex').mockResolvedValue(undefined);

      await cache.setSummary(userId, summary);

      expect(redis.setex).toHaveBeenCalledWith(
        `earnings:total:${userId}`,
        expect.any(Number), // TTL should be a number
        JSON.stringify(summary),
      );

      const ttlArg = (redis.setex as jest.Mock).mock.calls[0][1];
      expect(ttlArg).toBeGreaterThan(0);
    });
  });

  describe('Cache Key Patterns', () => {
    it('should use correct key format for summary', () => {
      expect(cache.summaryKey(123)).toBe('earnings:total:123');
    });

    it('should use correct key format for lightweight total', () => {
      expect(cache.totalKey(456)).toBe('earnings:user:456:total');
    });

    it('should differentiate cache keys for different users', () => {
      const user1Summary = cache.summaryKey(1);
      const user2Summary = cache.summaryKey(2);
      expect(user1Summary).not.toBe(user2Summary);
    });
  });
});
