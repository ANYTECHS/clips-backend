import { Test, TestingModule } from '@nestjs/testing';
import { EarningsService } from './earnings.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { ConfigService } from '../config/config.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

describe('EarningsService', () => {
  let service: EarningsService;
  let prisma: any;
  let redis: any;

  beforeEach(async () => {
    prisma = {
      earning: {
        aggregate: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
      },
      payout: { aggregate: jest.fn() },
      clip: { findUnique: jest.fn() },
      withTransaction: jest.fn((fn: any) => fn(prisma)),
      earning: { aggregate: jest.fn(), findMany: jest.fn(), create: jest.fn() },
      payout: { aggregate: jest.fn() },
      monthlyEarning: { findUnique: jest.fn() },
      clip: { findUnique: jest.fn() },
    };
    redis = {
      get: jest.fn().mockResolvedValue(null),
      setex: jest.fn(),
      del: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EarningsService,
        { provide: PrismaService, useValue: prisma },
        { provide: RedisService, useValue: redis },
        { provide: ConfigService, useValue: { earningsCacheTtlSeconds: 3600 } },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
      ],
    }).compile();

    service = module.get(EarningsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getUserTotalEarnings', () => {
    it('returns cached result when available', async () => {
      const cached = {
        totalEarned: 100,
        totalPaidOut: 50,
        availableBalance: 50,
        currency: 'USD',
      };
      const cached = { totalEarned: 100, totalPaidOut: 50, availableBalance: 50, currency: 'USD' };
      redis.get.mockResolvedValue(JSON.stringify(cached));

      const result = await service.getUserTotalEarnings(1);
      expect(result).toEqual(cached);
      expect(prisma.earning.aggregate).not.toHaveBeenCalled();
    });

    it('computes from database when cache miss', async () => {
      prisma.earning.aggregate.mockResolvedValue({ _sum: { amount: 200 } });
      prisma.payout.aggregate.mockResolvedValue({ _sum: { amount: 80 } });

      const result = await service.getUserTotalEarnings(1);
      expect(result.totalEarned).toBe(200);
      expect(result.totalPaidOut).toBe(80);
      expect(result.availableBalance).toBe(120);
      expect(redis.setex).toHaveBeenCalled();
    });
  });

  describe('getEarningsByPeriod', () => {
    it('queries earnings within date range', async () => {
      const mockEarnings = [
        { id: 1, amount: 50, currency: 'USD', date: new Date(), source: 'youtube', clipId: 1 },
      ];
      prisma.earning.findMany.mockResolvedValue(mockEarnings);

      const result = await service.getEarningsByPeriod(
        1,
        new Date('2025-01-01'),
        new Date('2025-12-31'),
      );
      expect(result).toEqual(mockEarnings);
      expect(prisma.earning.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            clip: { video: { userId: 1 } },
          }),
        }),
      );
    });
  });
});