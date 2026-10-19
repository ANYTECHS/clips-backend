import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EarningsAggregationService } from './earnings-aggregation.service';
import { PrismaService } from '../prisma/prisma.service';
import { CurrencyConversionService } from './currency-conversion.service';
import { RedisService } from '../redis/redis.service';
import { ConfigService } from '../config/config.service';
import { Currency } from './earnings.types';

describe('EarningsAggregationService', () => {
  let service: EarningsAggregationService;
  const findMany = jest.fn();
  const transaction = jest.fn((fn) => fn({ earning: { findMany } }));

  beforeEach(async () => {
    findMany.mockReset();
    transaction.mockClear();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EarningsAggregationService,
        {
          provide: PrismaService,
          useValue: {
            $transaction: transaction,
            earning: { findMany },
            payout: { findMany: jest.fn().mockResolvedValue([]) },
          },
        },
        {
          provide: CurrencyConversionService,
          useValue: {
            convert: jest.fn((amount: number) => amount),
          },
        },
        {
          provide: RedisService,
          useValue: {
            get: jest.fn().mockResolvedValue(null),
            setex: jest.fn(),
            del: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: { earningsCacheTtlSeconds: 60, leaderboardEnabled: true },
        },
      ],
    }).compile();

    service = module.get(EarningsAggregationService);
  });

  describe('getUserTotalEarnings', () => {
    it('aggregates currency-aware totals and breakdown', async () => {
      findMany.mockResolvedValue([
        { amount: 100, currency: 'USD', source: 'royalty' },
        { amount: 50, currency: 'USD', source: 'subscription' },
      ]);

      const result = await service.getUserTotalEarnings(1, Currency.USD);

      expect(result.total).toBe(150);
      expect(result.currency).toBe('USD');
      expect(result.breakdown).toEqual({ royalties: 100, subscriptions: 50 });
      expect(transaction).toHaveBeenCalled();
    });
  });

  describe('getEarningsByPeriod', () => {
    it('returns items for the period', async () => {
      findMany.mockResolvedValue([
        {
          id: 1,
          amount: 10,
          currency: 'USD',
          source: 'royalty',
          date: new Date('2025-06-01T00:00:00.000Z'),
          clip: { title: 'Clip A' },
        },
      ]);

      const result = await service.getEarningsByPeriod(
        1,
        new Date('2025-01-01'),
        new Date('2025-12-31'),
        Currency.USD,
      );

      expect(result.total).toBe(10);
      expect(result.items).toHaveLength(1);
      expect(result.items[0].clipTitle).toBe('Clip A');
    });

    it('rejects invalid date ranges', async () => {
      await expect(
        service.getEarningsByPeriod(
          1,
          new Date('2025-12-31'),
          new Date('2025-01-01'),
          Currency.USD,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('aggregateEarnings', () => {
    it('sums royalties and subscriptions separately', () => {
      const result = service.aggregateEarnings(
        [
          { amount: 20, currency: 'USD', source: 'royalty' },
          { amount: 5, currency: 'USD', source: 'subscription' },
          { amount: 3, currency: 'USD', source: 'other' },
        ],
        Currency.USD,
      );

      expect(result.total).toBe(28);
      expect(result.breakdown.royalties).toBe(20);
      expect(result.breakdown.subscriptions).toBe(5);
    });
  });
});
