import { Test, TestingModule } from '@nestjs/testing';
import { EarningsService } from './earnings.service';
import { EarningsAggregationService } from './earnings-aggregation.service';
import { EarningsExportService } from './earnings-export.service';
import { EarningsMetricsService } from './earnings-metrics.service';
import { CurrencyConversionService } from './currency-conversion.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { ConfigService } from '../config/config.service';

describe('EarningsService', () => {
  let service: EarningsService;

  const mockPrismaService = {
    earning: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    payout: {
      findMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const mockRedisService = {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
    setex: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(undefined),
  };

  const mockConfigService = {
    earningsCacheTtlSeconds: 3600,
    leaderboardEnabled: false,
  };

  beforeEach(async () => {
    mockPrismaService.$transaction.mockImplementation(
      async (arg: unknown) => {
        if (typeof arg === 'function') {
          return arg(mockPrismaService);
        }
        return Promise.all(arg as Promise<unknown>[]);
      },
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EarningsService,
        EarningsAggregationService,
        EarningsExportService,
        EarningsMetricsService,
        CurrencyConversionService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: RedisService,
          useValue: mockRedisService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<EarningsService>(EarningsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getUserTotalEarnings', () => {
    it('should aggregate royalties and subscriptions', async () => {
      mockPrismaService.earning.findMany.mockResolvedValue([
        { amount: 100, source: 'royalty' },
        { amount: 50, source: 'subscription' },
        { amount: 25, source: 'royalty' },
      ]);

      const result = await service.getUserTotalEarnings(1);

      expect(result.total).toBe(175);
      expect(result.breakdown).toEqual({
        royalties: 125,
        subscriptions: 50,
      });
      expect(mockPrismaService.$transaction).toHaveBeenCalled();
    });

    it('should return zero totals when user has no earnings', async () => {
      mockPrismaService.earning.findMany.mockResolvedValue([]);

      const result = await service.getUserTotalEarnings(1);

      expect(result).toEqual({
        total: 0,
        currency: 'USD',
        breakdown: { royalties: 0, subscriptions: 0 },
      });
    });
  });

  describe('getEarningsByPeriod', () => {
    it('should return earnings within the date range', async () => {
      mockPrismaService.earning.findMany.mockResolvedValue([
        {
          id: 1,
          amount: 80,
          source: 'royalty',
          date: new Date('2024-06-01T00:00:00.000Z'),
          clip: { title: 'Summer clip' },
        },
      ]);

      const result = await service.getEarningsByPeriod(
        1,
        new Date('2024-01-01'),
        new Date('2024-12-31'),
      );

      expect(result.total).toBe(80);
      expect(result.items).toHaveLength(1);
      expect(result.items[0].clipTitle).toBe('Summer clip');
      expect(mockPrismaService.earning.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            date: expect.objectContaining({
              gte: expect.any(Date),
              lte: expect.any(Date),
            }),
          }),
        }),
      );
    });

    it('should throw when startDate is after endDate', async () => {
      await expect(
        service.getEarningsByPeriod(
          1,
          new Date('2024-12-31'),
          new Date('2024-01-01'),
        ),
      ).rejects.toThrow('Start date must be before end date');
    });
  });

  describe('getEarningsDashboard', () => {
    it('should return empty data when user has no earnings', async () => {
      mockPrismaService.earning.findMany.mockResolvedValue([]);
      mockPrismaService.payout.findMany.mockResolvedValue([]);

      const result = await service.getEarningsDashboard(1);

      expect(result).toEqual({
        totalEarned: 0,
        currency: 'USD',
        pendingPayout: 0,
        paidOut: 0,
        breakdown: { royalties: 0, subscriptions: 0 },
        history: [],
      });
      expect(mockPrismaService.earning.findMany).toHaveBeenCalled();
    });

    it('should return earnings data when user has earnings', async () => {
      const earnings = [
        {
          amount: 100,
          source: 'royalty',
          date: new Date('2024-01-01'),
        },
        {
          amount: 50,
          source: 'subscription',
          date: new Date('2024-01-02'),
        },
      ];

      const payouts = [
        {
          amount: 75,
          status: 'completed',
          createdAt: new Date('2024-01-03'),
        },
      ];

      mockPrismaService.earning.findMany.mockResolvedValue(earnings);
      mockPrismaService.payout.findMany.mockResolvedValue(payouts);

      const result = await service.getEarningsDashboard(1);

      expect(result.totalEarned).toBe(150);
      expect(result.paidOut).toBe(75);
      expect(result.breakdown.royalties).toBe(100);
      expect(result.breakdown.subscriptions).toBe(50);
      expect(result.history.length).toBeGreaterThan(0);
    });

    it('should apply pagination correctly', async () => {
      mockPrismaService.earning.findMany.mockResolvedValue([]);
      mockPrismaService.payout.findMany.mockResolvedValue([]);

      const result = await service.getEarningsDashboard(1, 2, 10);

      expect(result.history).toEqual([]);
    });

    it('should pass deletedAt: null filter in earnings query', async () => {
      mockPrismaService.earning.findMany.mockResolvedValue([]);
      mockPrismaService.payout.findMany.mockResolvedValue([]);

      await service.getEarningsDashboard(1);

      expect(mockPrismaService.earning.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ deletedAt: null }),
        }),
      );
    });
  });

  describe('softDelete', () => {
    it('should soft-delete an earning owned by the user', async () => {
      mockPrismaService.earning.findUnique.mockResolvedValue({
        id: 1,
        deletedAt: null,
        clip: { video: { userId: 1 } },
      });
      mockPrismaService.earning.update.mockResolvedValue({});

      const result = await service.softDelete(1, 1);

      expect(result).toEqual({ message: 'Earning deleted successfully' });
      expect(mockPrismaService.earning.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { deletedAt: expect.any(Date) },
      });
    });

    it('should throw NotFoundException if earning does not exist', async () => {
      mockPrismaService.earning.findUnique.mockResolvedValue(null);

      await expect(service.softDelete(999, 1)).rejects.toThrow(
        'Earning 999 not found',
      );
    });

    it('should throw NotFoundException if earning belongs to another user', async () => {
      mockPrismaService.earning.findUnique.mockResolvedValue({
        id: 1,
        deletedAt: null,
        clip: { video: { userId: 2 } },
      });

      await expect(service.softDelete(1, 1)).rejects.toThrow(
        'Earning 1 not found',
      );
    });

    it('should throw NotFoundException if earning is already soft-deleted', async () => {
      mockPrismaService.earning.findUnique.mockResolvedValue({
        id: 1,
        deletedAt: new Date(),
        clip: { video: { userId: 1 } },
      });

      await expect(service.softDelete(1, 1)).rejects.toThrow(
        'Earning 1 not found',
      );
    });
  });

  describe('getLeaderboard', () => {
    it('should return empty array when LEADERBOARD_ENABLED is not true', async () => {
      mockConfigService.leaderboardEnabled = false;

      const result = await service.getLeaderboard();

      expect(result).toEqual([]);
    });

    it('should return empty array when no earnings exist', async () => {
      mockConfigService.leaderboardEnabled = true;
      mockPrismaService.earning.findMany.mockResolvedValue([]);

      const result = await service.getLeaderboard();

      expect(result).toEqual([]);
    });

    it('should return anonymized ranked creators', async () => {
      mockConfigService.leaderboardEnabled = true;
      mockPrismaService.earning.findMany.mockResolvedValue([
        { amount: 100, clip: { video: { userId: 1 } } },
        { amount: 200, clip: { video: { userId: 2 } } },
        { amount: 50, clip: { video: { userId: 1 } } },
      ]);

      const result = await service.getLeaderboard();

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ rank: 1, label: 'Creator #1', totalEarned: 200 });
      expect(result[1]).toEqual({ rank: 2, label: 'Creator #2', totalEarned: 150 });
    });

    it('should respect limit parameter', async () => {
      mockConfigService.leaderboardEnabled = true;
      mockPrismaService.earning.findMany.mockResolvedValue([
        { amount: 100, clip: { video: { userId: 1 } } },
        { amount: 200, clip: { video: { userId: 2 } } },
        { amount: 300, clip: { video: { userId: 3 } } },
      ]);

      const result = await service.getLeaderboard(2);

      expect(result).toHaveLength(2);
      expect(result[0].totalEarned).toBe(300);
      expect(result[1].totalEarned).toBe(200);
    });

    it('should not expose user IDs in results', async () => {
      mockConfigService.leaderboardEnabled = true;
      mockPrismaService.earning.findMany.mockResolvedValue([
        { amount: 100, clip: { video: { userId: 42 } } },
      ]);

      const result = await service.getLeaderboard();

      const resultStr = JSON.stringify(result);
      expect(resultStr).not.toContain('42');
      expect(resultStr).not.toContain('userId');
    });
  });

  describe('exportEarningsCsv', () => {
    it('returns CSV with headers and earning rows', async () => {
      mockPrismaService.earning.findMany.mockResolvedValue([
        {
          id: 7,
          amount: 25.5,
          currency: 'USD',
          date: new Date('2024-06-15T12:00:00.000Z'),
          source: 'royalty',
          clip: { title: 'Viral moment' },
        },
      ]);

      const result = await service.exportEarningsCsv(1, {});

      expect(result.filename).toMatch(/^earnings-export-\d{4}-\d{2}-\d{2}\.csv$/);
      expect(result.content).toContain(
        'date,clip title,amount,currency,source,transactionId',
      );
      expect(result.content).toContain('Viral moment');
      expect(result.content).toContain('royalty');
      expect(mockPrismaService.earning.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { clip: { video: { userId: 1 } }, deletedAt: null },
          orderBy: { date: 'desc' },
        }),
      );
    });

    it('filters by date range when startDate and endDate are provided', async () => {
      mockPrismaService.earning.findMany.mockResolvedValue([]);

      await service.exportEarningsCsv(1, {
        startDate: '2024-01-01',
        endDate: '2024-12-31',
      });

      expect(mockPrismaService.earning.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            date: expect.objectContaining({
              gte: expect.any(Date),
              lte: expect.any(Date),
            }),
          }),
        }),
      );
    });

    it('allows partial date filters in export options', async () => {
      mockPrismaService.earning.findMany.mockResolvedValue([]);

      await service.exportEarningsCsv(1, { startDate: '2024-01-01' });

      expect(mockPrismaService.earning.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            date: expect.objectContaining({
              gte: expect.any(Date),
            }),
          }),
        }),
      );
    });
  });
});
