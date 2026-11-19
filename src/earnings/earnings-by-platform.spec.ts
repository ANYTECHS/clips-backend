import { Test, TestingModule } from '@nestjs/testing';
import { EarningsAggregationService } from './earnings-aggregation.service';
import { CurrencyConversionService } from './currency-conversion.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { ConfigService } from '../config/config.service';
import { Currency } from './earnings.types';

describe('EarningsAggregationService - getEarningsByPlatform', () => {
  let service: EarningsAggregationService;
  let prisma: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EarningsAggregationService,
        CurrencyConversionService,
        {
          provide: PrismaService,
          useValue: {
            earning: {
              findMany: jest.fn(),
            },
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
          useValue: {
            earningsCacheTtlSeconds: 3600,
            leaderboardEnabled: false,
          },
        },
      ],
    }).compile();

    service = module.get<EarningsAggregationService>(EarningsAggregationService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  it('should group earnings by platform and convert currencies', async () => {
    const mockEarnings = [
      { amount: 100, currency: 'USD', source: 'tiktok', date: new Date('2026-02-01') },
      { amount: 150, currency: 'EUR', source: 'instagram', date: new Date('2026-03-01') },
      { amount: 200, currency: 'USD', source: 'tiktok', date: new Date('2026-04-01') },
      { amount: 50, currency: 'GBP', source: 'youtube', date: new Date('2026-05-01') },
    ];

    jest.spyOn(prisma.earning, 'findMany').mockResolvedValue(mockEarnings as any);

    const result = await service.getEarningsByPlatform(1, undefined, undefined, 'USD');

    expect(result.data).toHaveLength(3);
    expect(result.data[0].platform).toBe('tiktok');
    expect(result.data[0].amount).toBeCloseTo(300, 1);
    expect(result.data[1].platform).toBe('instagram');
    expect(result.data[1].amount).toBeCloseTo(163.04, 1);
    expect(result.data[2].platform).toBe('youtube');
    expect(result.data[2].amount).toBeCloseTo(63.29, 1);
  });

  it('should filter by date range', async () => {
    jest.spyOn(prisma.earning, 'findMany').mockResolvedValue([]);

    await service.getEarningsByPlatform(1, '2026-01-01', '2026-06-30', 'USD');

    expect(prisma.earning.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          date: {
            gte: new Date('2026-01-01'),
            lte: new Date('2026-06-30'),
          },
        }),
      }),
    );
  });
});
