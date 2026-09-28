import { Test, TestingModule } from '@nestjs/testing';
import { EarningsService } from './earnings.service';
import { PrismaService } from '../prisma/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CurrencyService } from '../common/services/currency.service';
import { EarningsCacheService } from './earnings-cache.service';

describe('EarningsService', () => {
  let service: EarningsService;
  let prisma: any;
  let cache: any;
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
    cache = {
      getSummary: jest.fn().mockResolvedValue(null),
      setSummary: jest.fn(),
      getTotal: jest.fn().mockResolvedValue(null),
      setTotal: jest.fn(),
      invalidate: jest.fn(),
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
        { provide: EarningsCacheService, useValue: cache },
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
      cache.getSummary.mockResolvedValue(cached);

      const result = await service.getUserTotalEarnings(1);
      expect(result).toEqual(cached);
      expect(prisma.earning.aggregate).not.toHaveBeenCalled();
    });

    it('computes from database when cache miss', async () => {
      prisma.earning.aggregate.mockResolvedValue({
        _sum: { amountInBaseCurrency: 200 },
      });
      prisma.payout.aggregate.mockResolvedValue({ _sum: { amount: 80 } });

      const result = await service.getUserTotalEarnings(1);
      expect(result.totalEarned).toBe(200);
      expect(result.totalPaidOut).toBe(80);
      expect(result.availableBalance).toBe(120);
      expect(cache.setSummary).toHaveBeenCalled();
    });
  });

  describe('getUserTotalEarningsCached', () => {
    it('returns cached result when available', async () => {
      const cached = { total: 2500.5, currency: 'USD' };
      cache.getTotal.mockResolvedValue(cached);

      const result = await service.getUserTotalEarningsCached(1);
      expect(result).toEqual(cached);
      expect(prisma.earning.aggregate).not.toHaveBeenCalled();
    });

    it('computes from database when cache miss and sets cache', async () => {
      prisma.earning.aggregate.mockResolvedValue({
        _sum: { amountInBaseCurrency: 1250.5 },
      });

      const result = await service.getUserTotalEarningsCached(1);
      expect(result.total).toBe(1250.5);
      expect(result.currency).toBe('USD');
      expect(cache.setTotal).toHaveBeenCalledWith(1, {
        total: 1250.5,
        currency: 'USD',
      });
    });

    it('recovers gracefully when cache returns null (Redis down)', async () => {
      cache.getTotal.mockResolvedValue(null);
      cache.setTotal.mockResolvedValue(undefined);
      prisma.earning.aggregate.mockResolvedValue({
        _sum: { amountInBaseCurrency: 500 },
      });

      const result = await service.getUserTotalEarningsCached(1);
      expect(result.total).toBe(500);
      expect(result.currency).toBe('USD');
    });
  });

  describe('createEarning', () => {
    it('invalidates cache and emits earnings.updated', async () => {
      prisma.earning.create.mockResolvedValue({
        id: 1,
        clipId: 10,
        amount: 25,
        currency: 'USD',
      });
      prisma.clip.findUnique.mockResolvedValue({
        id: 10,
        video: { userId: 42 },
      });

      await service.createEarning({
        clipId: 10,
        amount: 25,
        date: new Date(),
        source: 'test',
      });

      expect(redis.del).toHaveBeenCalledWith('earnings:total:5', 'earnings:user:5:total');
      expect(eventEmitter.emit).toHaveBeenCalledWith('earnings.updated', {
        userId: 5,
        earningId: 10,
        amount: 150,
        currency: 'USD',
      });
      expect(cache.invalidate).toHaveBeenCalledWith(42);
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'earnings.updated',
        expect.objectContaining({ userId: 42, earningId: 1 }),
      );
    });
  });
});
