import { Test, TestingModule } from '@nestjs/testing';
import { EarningsService } from '../src/earnings/earnings.service';
import { EarningsAggregationService } from '../src/earnings/earnings-aggregation.service';
import { EarningsExportService } from '../src/earnings/earnings-export.service';
import { CurrencyConversionService } from '../src/earnings/currency-conversion.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { RedisService } from '../src/redis/redis.service';
import { ConfigService } from '../src/config/config.service';
import { buildClipRecordList } from './fixtures/clip.fixture';

/**
 * Integration tests for EarningsService.
 * Uses an in-memory Prisma stand-in to verify aggregation logic
 * with realistic multi-clip fixture data.
 */

class InMemoryPrisma {
  private earnings: any[] = [];
  private payouts: any[] = [];

  earning = {
    findMany: jest.fn(async ({ where }: any = {}) => {
      let rows = this.earnings;
      if (where?.deletedAt === null) rows = rows.filter((e) => e.deletedAt === null);
      if (where?.clip?.video?.userId !== undefined) {
        rows = rows.filter((e) => e._userId === where.clip.video.userId);
      }
      if (where?.date?.gte) rows = rows.filter((e) => e.date >= where.date.gte);
      if (where?.date?.lte) rows = rows.filter((e) => e.date <= where.date.lte);
      return rows;
    }),
    findUnique: jest.fn(async ({ where, include }: any) => {
      const e = this.earnings.find((x) => x.id === where.id) ?? null;
      if (!e || !include) return e;
      return { ...e, clip: { video: { userId: e._userId } } };
    }),
    update: jest.fn(async ({ where, data }: any) => {
      const idx = this.earnings.findIndex((x) => x.id === where.id);
      if (idx !== -1) this.earnings[idx] = { ...this.earnings[idx], ...data };
      return this.earnings[idx];
    }),
  };

  payout = {
    findMany: jest.fn(async ({ where }: any = {}) => {
      if (where?.userId !== undefined) {
        return this.payouts.filter((p) => p.userId === where.userId);
      }
      return this.payouts;
    }),
  };

  $transaction = jest.fn(async (arg: any) => {
    if (typeof arg === 'function') return arg(this);
    return Promise.all(arg);
  });

  // ── seed helpers ──────────────────────────────────────────────────────────
  _seedEarning(earning: any) { this.earnings.push(earning); }
  _seedPayout(payout: any) { this.payouts.push(payout); }
  _reset() { this.earnings = []; this.payouts = []; }
}

describe('EarningsService (integration)', () => {
  let service: EarningsService;
  let prisma: InMemoryPrisma;

  beforeEach(async () => {
    prisma = new InMemoryPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EarningsService,
        EarningsAggregationService,
        EarningsExportService,
        CurrencyConversionService,
        { provide: PrismaService, useValue: prisma },
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
          useValue: {
            earningsCacheTtlSeconds: 3600,
            leaderboardEnabled: false,
          },
        },
      ],
    }).compile();

    service = module.get<EarningsService>(EarningsService);
  });

  afterEach(() => prisma._reset());

  // ── getUserTotalEarnings ──────────────────────────────────────────────────

  describe('getUserTotalEarnings', () => {
    it('calculates total earnings across multiple clips', async () => {
      const clips = buildClipRecordList(3);
      clips.forEach((clip, i) => {
        prisma._seedEarning({
          id: i + 1,
          amount: (i + 1) * 10,   // 10, 20, 30
          source: 'royalty',
          _userId: 1,
          deletedAt: null,
          clip: { video: { userId: 1 } },
        });
      });

      const result = await service.getUserTotalEarnings(1);

      expect(result.total).toBe(60);
      expect(result.breakdown.royalties).toBe(60);
      expect(result.breakdown.subscriptions).toBe(0);
    });

    it('returns platform breakdown separating royalties and subscriptions', async () => {
      [
        { id: 1, amount: 50, source: 'royalty' },
        { id: 2, amount: 30, source: 'subscription' },
        { id: 3, amount: 20, source: 'royalty' },
      ].forEach((e) =>
        prisma._seedEarning({ ...e, _userId: 1, deletedAt: null, clip: { video: { userId: 1 } } }),
      );

      const result = await service.getUserTotalEarnings(1);

      expect(result.total).toBe(100);
      expect(result.breakdown).toEqual({ royalties: 70, subscriptions: 30 });
    });

    it('returns zero totals when user has no earnings', async () => {
      const result = await service.getUserTotalEarnings(99);
      expect(result).toEqual({
        total: 0,
        currency: 'USD',
        breakdown: { royalties: 0, subscriptions: 0 },
      });
    });
  });

  // ── getEarningsDashboard ──────────────────────────────────────────────────

  describe('getEarningsDashboard', () => {
    it('aggregates earnings and payouts into dashboard', async () => {
      prisma._seedEarning({
        id: 1, amount: 100, source: 'royalty',
        date: new Date('2026-01-10'), _userId: 1, deletedAt: null,
      });
      prisma._seedEarning({
        id: 2, amount: 40, source: 'subscription',
        date: new Date('2026-01-12'), _userId: 1, deletedAt: null,
      });
      prisma._seedPayout({ id: 1, userId: 1, amount: 60, status: 'completed', createdAt: new Date('2026-01-15') });
      prisma._seedPayout({ id: 2, userId: 1, amount: 20, status: 'pending', createdAt: new Date('2026-01-16') });

      const result = await service.getEarningsDashboard(1);

      expect(result.totalEarned).toBe(140);
      expect(result.paidOut).toBe(60);
      expect(result.pendingPayout).toBe(20);
      expect(result.breakdown).toEqual({ royalties: 100, subscriptions: 40 });
    });

    it('excludes soft-deleted earnings from totals', async () => {
      prisma._seedEarning({
        id: 1, amount: 200, source: 'royalty',
        date: new Date('2026-01-10'), _userId: 1, deletedAt: new Date(),
      });

      const result = await service.getEarningsDashboard(1);

      expect(result.totalEarned).toBe(0);
    });

    it('returns empty dashboard when user has no data', async () => {
      const result = await service.getEarningsDashboard(1);
      expect(result).toEqual({
        totalEarned: 0,
        currency: 'USD',
        pendingPayout: 0,
        paidOut: 0,
        breakdown: { royalties: 0, subscriptions: 0 },
        history: [],
      });
    });
  });

  // ── softDelete ────────────────────────────────────────────────────────────

  describe('softDelete', () => {
    it('soft-deletes an earning and excludes it from future totals', async () => {
      prisma._seedEarning({
        id: 5, amount: 75, source: 'royalty',
        date: new Date(), _userId: 1, deletedAt: null,
        clip: { video: { userId: 1 } },
      });

      const result = await service.softDelete(5, 1);
      expect(result.message).toMatch(/deleted/i);
      expect(prisma.earning.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 5 }, data: { deletedAt: expect.any(Date) } }),
      );
    });
  });
});
