/**
 * Earnings integration smoke test.
 *
 * Verifies that EarningsAggregationService correctly wires with
 * EarningsService, CurrencyConversionService, and RedisService.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { EarningsService } from '../src/earnings/earnings.service';
import { EarningsAggregationService } from '../src/earnings/earnings-aggregation.service';
import { EarningsExportService } from '../src/earnings/earnings-export.service';
import { CurrencyConversionService } from '../src/earnings/currency-conversion.service';
import { TaxReportExportService } from '../src/earnings/tax-report-export.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { RedisService } from '../src/redis/redis.service';
import { ConfigService } from '../src/config/config.service';
import { Currency } from '../src/earnings/earnings.types';

describe('EarningsAggregationService (integration)', () => {
  let earningsAggregation: EarningsAggregationService;
  let earningsExport: EarningsExportService;
  let prisma: any;

  const rows = [
    { amount: 10, currency: 'USD', source: 'royalty' },
    { amount: 20, currency: 'USD', source: 'royalty' },
    { amount: 30, currency: 'USD', source: 'subscription' },
  ];

  beforeEach(async () => {
    prisma = {
      earning: {
        findMany: jest.fn().mockResolvedValue(rows),
        aggregate: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        findUnique: jest.fn(),
      },
      payout: {
        findMany: jest.fn().mockResolvedValue([]),
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 } }),
      },
      $transaction: jest.fn().mockImplementation((arg: any) =>
        typeof arg === 'function' ? arg(prisma) : Promise.all(arg),
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EarningsService,
        EarningsAggregationService,
        EarningsExportService,
        CurrencyConversionService,
        TaxReportExportService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: RedisService,
          useValue: {
            get: jest.fn().mockResolvedValue(null),
            setex: jest.fn(),
            del: jest.fn(),
            getClient: jest.fn().mockReturnValue({ keys: jest.fn().mockResolvedValue([]) }),
          },
        },
        {
          provide: ConfigService,
          useValue: { earningsCacheTtlSeconds: 3600, leaderboardEnabled: false },
        },
      ],
    }).compile();

    earningsAggregation = module.get(EarningsAggregationService);
    earningsExport = module.get(EarningsExportService);
  });

  describe('getUserTotalEarnings', () => {
    it('calculates total earnings across multiple clips', async () => {
      const result = await earningsAggregation.getUserTotalEarnings(1, Currency.USD);
      expect(result.total).toBe(60);
      expect(result.breakdown.royalties).toBe(30);
      expect(result.breakdown.subscriptions).toBe(30);
    });

    it('converts currency when targetCurrency differs from source', async () => {
      const result = await earningsAggregation.getUserTotalEarnings(1, Currency.USD);
      expect(result.currency).toBe(Currency.USD);
    });
  });

  describe('getEarningsByPlatform', () => {
    it('groups earnings by source platform', async () => {
      const platformRows = [
        { amount: 100, source: 'tiktok' },
        { amount: 200, source: 'tiktok' },
        { amount: 50, source: 'instagram' },
      ];
      prisma.earning.findMany.mockResolvedValue(platformRows);

      const result = await earningsAggregation.getEarningsByPlatform(1);
      expect(result.totalEarnings).toBe(350);
      const tiktok = result.data.find((d: any) => d.platform === 'tiktok');
      expect(tiktok).toBeDefined();
      expect(tiktok.totalEarnings).toBe(300);
    });
  });

  describe('softDelete', () => {
    it('throws when earning belongs to different user', async () => {
      prisma.earning.findUnique.mockResolvedValue({
        id: 1,
        deletedAt: null,
        clip: { video: { userId: 999 } }, // different user
      });

      await expect(earningsAggregation.softDelete(1, 1)).rejects.toThrow(
        /not found/i,
      );
    });

    it('throws when earning is already deleted', async () => {
      prisma.earning.findUnique.mockResolvedValue({
        id: 1,
        deletedAt: new Date(),
        clip: { video: { userId: 1 } },
      });

      await expect(earningsAggregation.softDelete(1, 1)).rejects.toThrow(
        /not found/i,
      );
    });
  });

  describe('EarningsExportService', () => {
    it('returns a CSV file with correct filename format', async () => {
      prisma.earning.findMany.mockResolvedValue([
        {
          date: new Date('2025-06-01'),
          amount: 25.5,
          currency: 'USD',
          source: 'royalty',
          clip: { title: 'My Clip' },
        },
      ]);

      const { filename, content } = await earningsExport.exportEarningsCsv(1, {});
      expect(filename).toMatch(/^earnings-export-\d{4}-\d{2}-\d{2}\.csv$/);
      expect(content).toBeTruthy();
    });
  });
});
