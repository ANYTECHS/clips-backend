/**
 * Earnings aggregation integration smoke.
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

describe('EarningsService (integration)', () => {
  it('calculates total earnings across multiple clips', async () => {
    const rows = [
      { amount: 10, currency: 'USD', source: 'royalty' },
      { amount: 20, currency: 'USD', source: 'royalty' },
      { amount: 30, currency: 'USD', source: 'royalty' },
    ];
    const prisma = {
      earning: {
        findMany: jest.fn(async () => rows),
      },
      payout: { findMany: jest.fn(async () => []) },
      $transaction: jest.fn(async (arg: any) =>
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
          useValue: { get: jest.fn().mockResolvedValue(null), setex: jest.fn(), del: jest.fn() },
        },
        {
          provide: ConfigService,
          useValue: { earningsCacheTtlSeconds: 3600, leaderboardEnabled: false },
        },
      ],
    }).compile();

    const service = module.get(EarningsService);
    const result = await service.getUserTotalEarnings(1);
    expect(result.total).toBe(60);
    expect(result.breakdown.royalties).toBe(60);
  });
});
