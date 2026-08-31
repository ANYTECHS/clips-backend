import { Test, TestingModule } from '@nestjs/testing';
import { EarningsService } from './earnings.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { ConfigService } from '../config/config.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CurrencyService } from '../common/services/currency.service';

describe('EarningsService', () => {
  let service: EarningsService;
  let prisma: any;
  let redis: any;
  let eventEmitter: any;
  let currencyService: any;

  beforeEach(async () => {
    prisma = {
      earning: {
        aggregate: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        findUnique: jest.fn(),
      },
      payout: { aggregate: jest.fn() },
      clip: { findUnique: jest.fn() },
    };
    redis = {
      get: jest.fn().mockResolvedValue(null),
      setex: jest.fn(),
      del: jest.fn(),
    };
    eventEmitter = {
      emit: jest.fn(),
    };
    currencyService = {
      getBaseCurrency: jest.fn().mockReturnValue('USD'),
      validateCurrency: jest.fn(),
      convertToBaseCurrency: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EarningsService,
        { provide: PrismaService, useValue: prisma },
        { provide: RedisService, useValue: redis },
        { provide: ConfigService, useValue: { earningsCacheTtlSeconds: 3600 } },
        { provide: EventEmitter2, useValue: eventEmitter },
        { provide: CurrencyService, useValue: currencyService },
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
      redis.get.mockResolvedValue(JSON.stringify(cached));

      const result = await service.getUserTotalEarnings(1);
      expect(result).toEqual(cached);
      expect(prisma.earning.aggregate).not.toHaveBeenCalled();
    });

    it('computes from database when cache miss', async () => {
      prisma.earning.aggregate.mockResolvedValue({ _sum: { amountInBaseCurrency: 200 } });
      prisma.payout.aggregate.mockResolvedValue({ _sum: { amount: 80 } });

      const result = await service.getUserTotalEarnings(1);
      expect(result.totalEarned).toBe(200);
      expect(result.totalPaidOut).toBe(80);
      expect(result.availableBalance).toBe(120);
      expect(redis.setex).toHaveBeenCalled();
    });
  });

  describe('getUserTotalEarningsCached', () => {
    it('returns cached result when available', async () => {
      const cached = { total: 2500.5, currency: 'USD' };
      redis.get.mockResolvedValue(JSON.stringify(cached));

      const result = await service.getUserTotalEarningsCached(1);
      expect(result).toEqual(cached);
      expect(prisma.earning.aggregate).not.toHaveBeenCalled();
    });

    it('computes from database when cache miss and sets cache', async () => {
      prisma.earning.aggregate.mockResolvedValue({ _sum: { amountInBaseCurrency: 1250.5 } });

      const result = await service.getUserTotalEarningsCached(1);
      expect(result.total).toBe(1250.5);
      expect(result.currency).toBe('USD');
      expect(redis.setex).toHaveBeenCalledWith(
        'earnings:user:1:total',
        3600,
        JSON.stringify({ total: 1250.5, currency: 'USD' }),
      );
    });

    it('recovers gracefully from Redis failures', async () => {
      redis.get.mockRejectedValue(new Error('Redis connection lost'));
      redis.setex.mockRejectedValue(new Error('Redis write failed'));
      prisma.earning.aggregate.mockResolvedValue({ _sum: { amountInBaseCurrency: 500 } });

      const result = await service.getUserTotalEarningsCached(1);
      expect(result.total).toBe(500);
      expect(result.currency).toBe('USD');
    });
  });

  describe('createEarning', () => {
    it('invalidates cache when earning is created', async () => {
      const date = new Date();
      prisma.earning.create.mockResolvedValue({ id: 10, amount: 150, currency: 'USD', date });
      prisma.clip.findUnique.mockResolvedValue({
        id: 1,
        video: { userId: 5 },
      });

      await service.createEarning({
        clipId: 1,
        amount: 150,
        currency: 'USD',
        date,
      });

      expect(redis.del).toHaveBeenCalledWith('earnings:total:5', 'earnings:user:5:total');
      expect(eventEmitter.emit).toHaveBeenCalledWith('earnings.updated', {
        userId: 5,
        earningId: 10,
        amount: 150,
      });
    });
  });
});
