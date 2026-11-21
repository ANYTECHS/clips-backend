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
  const payoutFindMany = jest.fn();
  const monthlyFindMany = jest.fn();
  const transaction = jest.fn((fn) => fn({ earning: { findMany } }));

  beforeEach(async () => {
    findMany.mockReset();
    payoutFindMany.mockReset();
    payoutFindMany.mockResolvedValue([]);
    monthlyFindMany.mockReset();
    transaction.mockClear();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EarningsAggregationService,
        {
          provide: PrismaService,
          useValue: {
            $transaction: transaction,
            earning: { findMany },
            payout: { findMany: payoutFindMany },
            monthlyEarning: { findMany: monthlyFindMany },
            payout: { findMany: jest.fn().mockResolvedValue([]) },
          },
        },
        {
          provide: CurrencyConversionService,
          useValue: {
            convert: jest.fn((amount: number, from: Currency, to: Currency) => {
              if (from === to) return amount;
              const rates: Record<string, number> = { EUR: 1.1, GBP: 1.25, USDC: 1, XLM: 0.12 };
              const inUsd = amount * (rates[from] ?? 1);
              if (to === Currency.USD) return inUsd;
              const targetRate = rates[to] ?? 1;
              return inUsd / targetRate;
            }),
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

    describe('getMonthlySummary', () => {
      it('computes fallback totals and platform breakdowns separately per currency', async () => {
        monthlyFindMany.mockResolvedValue([]);
        findMany.mockResolvedValue([
          { amount: 10, currency: 'USD', clip: { platform: 'tiktok' } },
          { amount: 5, currency: 'USD', clip: { platform: 'tiktok' } },
          { amount: 8, currency: 'EUR', clip: { platform: 'youtube' } },
        ]);

        const result = await service.getMonthlySummary(7, 2026, 2);

        expect(findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              date: {
                gte: new Date('2026-02-01T00:00:00.000Z'),
                lt: new Date('2026-03-01T00:00:00.000Z'),
              },
              deletedAt: null,
            }),
          }),
        );
        expect(result).toEqual({
          userId: 7,
          year: 2026,
          month: 2,
          items: [
            {
              totalAmount: 8,
              currency: 'EUR',
              platformBreakdown: { youtube: 8 },
            },
            {
              totalAmount: 15,
              currency: 'USD',
              platformBreakdown: { tiktok: 15 },
            },
          ],
          generated: false,
        });
      });

      it('returns persisted summaries with an optional currency filter', async () => {
        monthlyFindMany.mockResolvedValue([
          {
            totalAmount: 12,
            currency: 'EUR',
            platformBreakdown: { youtube: 12 },
          },
        ]);

        const result = await service.getMonthlySummary(7, 2026, 2, 'eur');

        expect(monthlyFindMany).toHaveBeenCalledWith({
          where: { userId: 7, year: 2026, month: 2, currency: 'EUR' },
          orderBy: { currency: 'asc' },
        });
        expect(result.items).toEqual([
          {
            totalAmount: 12,
            currency: 'EUR',
            platformBreakdown: { youtube: 12 },
          },
        ]);
        expect(result.generated).toBe(true);
        expect(findMany).not.toHaveBeenCalled();
      });
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

    it('aggregates multiple earnings records across multiple clips', async () => {
      findMany.mockResolvedValue([
        { id: 11, amount: 100, currency: 'USD', source: 'royalty', date: new Date('2026-09-20T12:00:00Z'), clip: { title: 'Clip A' } },
        { id: 12, amount: 25, currency: 'USD', source: 'subscription', date: new Date('2026-09-21T12:00:00Z'), clip: { title: 'Clip A' } },
        { id: 13, amount: 50, currency: 'EUR', source: 'royalty', date: new Date('2026-09-22T12:00:00Z'), clip: { title: 'Clip B' } },
      ]);

      const result = await service.getEarningsByPeriod(
        7,
        new Date('2026-09-01T00:00:00Z'),
        new Date('2026-09-30T00:00:00Z'),
        Currency.USD,
      );

      expect(result.total).toBeCloseTo(180);
      expect(result.breakdown).toEqual({ royalties: 155, subscriptions: 25 });
      expect(result.items).toHaveLength(3);
      expect(result.items.map((item) => item.clipTitle)).toEqual(
        expect.arrayContaining(['Clip A', 'Clip B']),
      );
      expect(transaction).toHaveBeenCalled();
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

    it('uses realistic rows across multiple clips and currencies', () => {
      const result = service.aggregateEarnings(
        [
          { amount: 100, currency: 'USD', source: 'royalty' },
          { amount: 50, currency: 'EUR', source: 'royalty' },
          { amount: 40, currency: 'GBP', source: 'subscription' },
          { amount: 25, currency: 'USDC', source: 'subscription' },
          { amount: 10, currency: 'XLM', source: 'royalty' },
        ],
        Currency.USD,
      );

      expect(result.total).toBeCloseTo(231.2);
      expect(result.breakdown.royalties).toBeCloseTo(156.2);
      expect(result.breakdown.subscriptions).toBeCloseTo(75);
    });
  });

  describe('getEarningsDashboard', () => {
    it('calculates earned, paid, pending, and paginated history from Prisma rows', async () => {
      findMany.mockResolvedValue([
        { amount: 100, currency: 'USD', source: 'royalty', date: new Date('2026-09-30T10:00:00Z') },
        { amount: 50, currency: 'EUR', source: 'subscription', date: new Date('2026-09-29T10:00:00Z') },
        { amount: 20, currency: 'GBP', source: 'royalty', date: new Date('2026-09-28T10:00:00Z') },
      ]);
      payoutFindMany.mockResolvedValue([
        { amount: 30, currency: 'USD', status: 'completed', createdAt: new Date('2026-09-27T10:00:00Z') },
        { amount: 20, currency: 'EUR', status: 'processing', createdAt: new Date('2026-09-26T10:00:00Z') },
        { amount: 10, currency: 'USD', status: 'failed', createdAt: new Date('2026-09-25T10:00:00Z') },
      ]);

      const result = await service.getEarningsDashboard(7, 1, 3, Currency.USD);

      expect(result.totalEarned).toBeCloseTo(180);
      expect(result.paidOut).toBe(30);
      expect(result.pendingPayout).toBeCloseTo(22);
      expect(result.history).toHaveLength(3);
      expect(result.history[0]).toEqual(expect.objectContaining({ type: 'royalty' }));
      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { clip: { video: { userId: 7 } }, deletedAt: null },
        }),
      );
    });

    it('paginates combined earnings and payout history', async () => {
      findMany.mockResolvedValue([
        { amount: 10, currency: 'USD', source: 'royalty', date: new Date('2026-09-03T00:00:00Z') },
        { amount: 20, currency: 'USD', source: 'subscription', date: new Date('2026-09-02T00:00:00Z') },
      ]);
      payoutFindMany.mockResolvedValue([
        { amount: 5, currency: 'USD', status: 'completed', createdAt: new Date('2026-09-04T00:00:00Z') },
      ]);

      const result = await service.getEarningsDashboard(7, 2, 2, Currency.USD);

      expect(result.history).toHaveLength(1);
      expect(result.history[0].date).toBe('2026-09-02T00:00:00.000Z');
    });
  });
});
