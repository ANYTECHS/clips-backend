import { Test, TestingModule } from '@nestjs/testing';
import {
  DailyEarningsAggregationService,
  previousUtcDay,
  startOfUtcDay,
} from './daily-earnings-aggregation.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

describe('DailyEarningsAggregationService (Issue #767)', () => {
  let service: DailyEarningsAggregationService;
  let prisma: {
    earning: { findMany: jest.Mock; aggregate: jest.Mock };
    payout: { aggregate: jest.Mock };
    dailyEarning: { upsert: jest.Mock };
    userEarningsSummary: { upsert: jest.Mock };
  };
  let redis: { del: jest.Mock };

  const earning = (
    id: number,
    userId: number,
    amount: number,
    overrides: Record<string, unknown> = {},
  ) => ({
    id,
    clipId: 100 + id,
    amount,
    currency: 'USD',
    amountInBaseCurrency: null,
    clip: { video: { userId } },
    ...overrides,
  });

  beforeEach(async () => {
    prisma = {
      earning: {
        findMany: jest.fn().mockResolvedValue([]),
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 } }),
      },
      payout: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 } }),
      },
      dailyEarning: { upsert: jest.fn().mockResolvedValue({}) },
      userEarningsSummary: { upsert: jest.fn().mockResolvedValue({}) },
    };
    redis = { del: jest.fn().mockResolvedValue(1) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DailyEarningsAggregationService,
        { provide: PrismaService, useValue: prisma },
        { provide: RedisService, useValue: redis },
      ],
    }).compile();

    service = module.get(DailyEarningsAggregationService);
  });

  describe('UTC day helpers', () => {
    it('startOfUtcDay truncates to midnight UTC', () => {
      const result = startOfUtcDay(new Date('2026-03-15T23:59:59.999Z'));
      expect(result.toISOString()).toBe('2026-03-15T00:00:00.000Z');
    });

    it('startOfUtcDay uses UTC, not the host timezone', () => {
      // 00:30 UTC on the 15th is still the 14th in any negative-offset zone;
      // it must bucket as the 15th regardless of where the worker runs.
      const result = startOfUtcDay(new Date('2026-03-15T00:30:00.000Z'));
      expect(result.toISOString()).toBe('2026-03-15T00:00:00.000Z');
    });

    it('previousUtcDay returns midnight UTC of the preceding day', () => {
      const result = previousUtcDay(new Date('2026-03-15T00:00:01.000Z'));
      expect(result.toISOString()).toBe('2026-03-14T00:00:00.000Z');
    });

    it('previousUtcDay crosses month boundaries', () => {
      const result = previousUtcDay(new Date('2026-03-01T00:05:00.000Z'));
      expect(result.toISOString()).toBe('2026-02-28T00:00:00.000Z');
    });
  });

  describe('aggregateDay', () => {
    it('defaults to the UTC day that just ended', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-03-15T00:00:05.000Z'));

      const result = await service.aggregateDay();

      expect(result.date.toISOString()).toBe('2026-03-14T00:00:00.000Z');
      jest.useRealTimers();
    });

    it('queries exactly the requested UTC day window', async () => {
      await service.aggregateDay(new Date('2026-03-14T13:22:00.000Z'));

      const where = prisma.earning.findMany.mock.calls[0][0].where;
      expect(where.date.gte.toISOString()).toBe('2026-03-14T00:00:00.000Z');
      expect(where.date.lt.toISOString()).toBe('2026-03-15T00:00:00.000Z');
      expect(where.deletedAt).toBeNull();
    });

    it('groups earnings by user and currency', async () => {
      prisma.earning.findMany.mockResolvedValueOnce([
        earning(1, 7, 10),
        earning(2, 7, 5.5),
        earning(3, 7, 20, { currency: 'EUR' }),
        earning(4, 9, 3),
      ]);

      const result = await service.aggregateDay(new Date('2026-03-14T00:00:00Z'));

      expect(result.bucketsWritten).toBe(3);
      expect(result.earningsProcessed).toBe(4);
      expect(result.usersUpdated).toBe(2);

      const written = prisma.dailyEarning.upsert.mock.calls.map(
        ([args]) => args.create,
      );
      expect(written).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            userId: 7,
            currency: 'USD',
            totalAmount: 15.5,
            earningCount: 2,
            clipCount: 2,
          }),
          expect.objectContaining({
            userId: 7,
            currency: 'EUR',
            totalAmount: 20,
            earningCount: 1,
          }),
          expect.objectContaining({ userId: 9, currency: 'USD', totalAmount: 3 }),
        ]),
      );
    });

    it('counts distinct clips, not earning rows', async () => {
      prisma.earning.findMany.mockResolvedValueOnce([
        earning(1, 7, 10, { clipId: 42 }),
        earning(2, 7, 10, { clipId: 42 }),
        earning(3, 7, 10, { clipId: 43 }),
      ]);

      await service.aggregateDay(new Date('2026-03-14T00:00:00Z'));

      const created = prisma.dailyEarning.upsert.mock.calls[0][0].create;
      expect(created.earningCount).toBe(3);
      expect(created.clipCount).toBe(2);
    });

    it('upserts on (userId, date, currency) so a re-run overwrites', async () => {
      prisma.earning.findMany.mockResolvedValueOnce([earning(1, 7, 10)]);

      await service.aggregateDay(new Date('2026-03-14T00:00:00Z'));

      const [args] = prisma.dailyEarning.upsert.mock.calls[0];
      expect(args.where.userId_date_currency).toEqual({
        userId: 7,
        date: new Date('2026-03-14T00:00:00.000Z'),
        currency: 'USD',
      });
      expect(args.update).toEqual(
        expect.objectContaining({ totalAmount: 10, earningCount: 1 }),
      );
    });

    it('sums amountInBaseCurrency only when rates were recorded', async () => {
      prisma.earning.findMany.mockResolvedValueOnce([
        earning(1, 7, 10, { currency: 'EUR', amountInBaseCurrency: 11 }),
        earning(2, 7, 10, { currency: 'EUR', amountInBaseCurrency: 11 }),
      ]);

      await service.aggregateDay(new Date('2026-03-14T00:00:00Z'));

      expect(prisma.dailyEarning.upsert.mock.calls[0][0].create.totalInBaseCurrency).toBe(22);
    });

    it('leaves totalInBaseCurrency null when no rate was recorded', async () => {
      prisma.earning.findMany.mockResolvedValueOnce([earning(1, 7, 10)]);

      await service.aggregateDay(new Date('2026-03-14T00:00:00Z'));

      expect(prisma.dailyEarning.upsert.mock.calls[0][0].create.totalInBaseCurrency).toBeNull();
    });

    it('skips earnings with no owning user instead of failing the run', async () => {
      prisma.earning.findMany.mockResolvedValueOnce([
        earning(1, 7, 10),
        { ...earning(2, 7, 99), clip: null },
      ]);

      const result = await service.aggregateDay(new Date('2026-03-14T00:00:00Z'));

      expect(result.earningsProcessed).toBe(1);
      expect(prisma.dailyEarning.upsert.mock.calls[0][0].create.totalAmount).toBe(10);
    });

    it('refreshes the lifetime summary and busts the cache for each user', async () => {
      prisma.earning.findMany.mockResolvedValueOnce([earning(1, 7, 10)]);
      prisma.earning.aggregate.mockResolvedValue({ _sum: { amount: 250 } });
      prisma.payout.aggregate.mockResolvedValue({ _sum: { amount: 100 } });

      await service.aggregateDay(new Date('2026-03-14T00:00:00Z'));

      const [args] = prisma.userEarningsSummary.upsert.mock.calls[0];
      expect(args.where).toEqual({ userId: 7 });
      expect(args.update).toEqual(
        expect.objectContaining({
          totalEarned: 250,
          totalPaidOut: 100,
          availableBalance: 150,
        }),
      );
      expect(redis.del).toHaveBeenCalledWith('earnings:total:7');
    });

    it('keeps going when one user summary fails', async () => {
      prisma.earning.findMany.mockResolvedValueOnce([
        earning(1, 7, 10),
        earning(2, 9, 10),
      ]);
      prisma.userEarningsSummary.upsert
        .mockRejectedValueOnce(new Error('deadlock'))
        .mockResolvedValueOnce({});

      await expect(
        service.aggregateDay(new Date('2026-03-14T00:00:00Z')),
      ).resolves.toEqual(expect.objectContaining({ usersUpdated: 2 }));

      expect(prisma.userEarningsSummary.upsert).toHaveBeenCalledTimes(2);
    });

    it('writes nothing when the day had no earnings', async () => {
      const result = await service.aggregateDay(new Date('2026-03-14T00:00:00Z'));

      expect(result.bucketsWritten).toBe(0);
      expect(result.earningsProcessed).toBe(0);
      expect(prisma.dailyEarning.upsert).not.toHaveBeenCalled();
      expect(prisma.userEarningsSummary.upsert).not.toHaveBeenCalled();
    });
  });
});
