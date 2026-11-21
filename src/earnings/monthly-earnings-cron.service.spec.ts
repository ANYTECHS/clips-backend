import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { MonthlyEarningsCronService } from './monthly-earnings-cron.service';

describe('MonthlyEarningsCronService', () => {
  let service: MonthlyEarningsCronService;
  const earningFindMany = jest.fn();
  const monthlyEarningUpsert = jest.fn();

  beforeEach(async () => {
    earningFindMany.mockReset();
    monthlyEarningUpsert.mockReset().mockResolvedValue({});

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MonthlyEarningsCronService,
        {
          provide: PrismaService,
          useValue: {
            earning: { findMany: earningFindMany },
            monthlyEarning: { upsert: monthlyEarningUpsert },
          },
        },
      ],
    }).compile();

    service = module.get(MonthlyEarningsCronService);
  });

  it('aggregates native currencies and platforms within a UTC half-open month', async () => {
    earningFindMany.mockResolvedValue([
      {
        id: 1,
        amount: 12.25,
        currency: 'USD',
        clip: { platform: 'tiktok', video: { userId: 7 } },
      },
      {
        id: 2,
        amount: 2.75,
        currency: 'USD',
        clip: { platform: 'youtube', video: { userId: 7 } },
      },
      {
        id: 3,
        amount: 8,
        currency: 'EUR',
        clip: { platform: 'youtube', video: { userId: 7 } },
      },
    ]);

    await service.generateMonthlySummaries(2026, 2);

    expect(earningFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          date: {
            gte: new Date('2026-02-01T00:00:00.000Z'),
            lt: new Date('2026-03-01T00:00:00.000Z'),
          },
          deletedAt: null,
        },
      }),
    );
    expect(monthlyEarningUpsert).toHaveBeenCalledTimes(2);
    expect(monthlyEarningUpsert).toHaveBeenCalledWith({
      where: {
        userId_year_month_currency: {
          userId: 7,
          year: 2026,
          month: 2,
          currency: 'USD',
        },
      },
      create: {
        userId: 7,
        year: 2026,
        month: 2,
        totalAmount: 15,
        currency: 'USD',
        platformBreakdown: { tiktok: 12.25, youtube: 2.75 },
      },
      update: {
        totalAmount: 15,
        platformBreakdown: { tiktok: 12.25, youtube: 2.75 },
      },
    });
    expect(monthlyEarningUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId_year_month_currency: {
            userId: 7,
            year: 2026,
            month: 2,
            currency: 'EUR',
          },
        },
        create: expect.objectContaining({
          totalAmount: 8,
          currency: 'EUR',
          platformBreakdown: { youtube: 8 },
        }),
      }),
    );
  });

  it('targets the previous UTC calendar month when the cron runs', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-03-01T00:00:00.000Z'));
    const generateMonthlySummaries = jest
      .spyOn(service, 'generateMonthlySummaries')
      .mockResolvedValue();

    try {
      await service.handleMonthlyEarningsCron();
      expect(generateMonthlySummaries).toHaveBeenCalledWith(2026, 2);
    } finally {
      jest.useRealTimers();
    }
  });
});
