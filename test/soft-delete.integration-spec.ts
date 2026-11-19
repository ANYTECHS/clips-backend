/**
 * Soft-delete integration smoke for earnings softDelete path.
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

describe('Soft Delete Integration', () => {
  it('sets deletedAt instead of removing the earning record', async () => {
    const earnings: any[] = [
      {
        id: 1,
        amount: 100,
        source: 'royalty',
        deletedAt: null,
        clip: { video: { userId: 42 } },
      },
    ];
    const prisma = {
      earning: {
        findUnique: jest.fn(async ({ where }: any) =>
          earnings.find((e) => e.id === where.id) ?? null,
        ),
        update: jest.fn(async ({ where, data }: any) => {
          const idx = earnings.findIndex((e) => e.id === where.id);
          earnings[idx] = { ...earnings[idx], ...data };
          return earnings[idx];
        }),
        findMany: jest.fn(async () => earnings.filter((e) => e.deletedAt === null)),
      },
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
          useValue: { earningsCacheTtlSeconds: 3600, leaderboardEnabled: true },
        },
      ],
    }).compile();

    const earningsService = module.get(EarningsService);
    const result = await earningsService.softDelete(1, 42);
    expect(result).toEqual({ message: 'Earning deleted successfully' });
    expect(earnings[0].deletedAt).toBeInstanceOf(Date);
  });
});
