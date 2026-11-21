import { MonthlyEarningsCronService } from './monthly-earnings-cron.service';

describe('MonthlyEarningsCronService', () => {
  const prisma = {
    earning: { findMany: jest.fn() },
    monthlyEarning: { upsert: jest.fn() },
  };

  let service: MonthlyEarningsCronService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new MonthlyEarningsCronService(prisma as any);
  });

  it('groups one monthly summary per currency and platform', async () => {
    prisma.earning.findMany
      .mockResolvedValueOnce([
        { clip: { video: { userId: 7 } } },
        { clip: { video: { userId: 7 } } },
      ])
      .mockResolvedValueOnce([
        { amount: 10, currency: 'USD', source: 'royalty', clip: { platform: 'youtube' } },
        { amount: 5, currency: 'USD', source: 'subscription', clip: { platform: 'youtube' } },
        { amount: 20, currency: 'EUR', source: 'royalty', clip: { platform: 'youtube' } },
      ]);

    await service.generateMonthlySummaries(2026, 9);

    expect(prisma.monthlyEarning.upsert).toHaveBeenCalledTimes(2);
    expect(prisma.monthlyEarning.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_year_month_currency: { userId: 7, year: 2026, month: 9, currency: 'USD' } },
        create: expect.objectContaining({
          totalAmount: 15,
          platformBreakdown: { royalty: 10, subscription: 5 },
        }),
      }),
    );
    expect(prisma.monthlyEarning.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_year_month_currency: { userId: 7, year: 2026, month: 9, currency: 'EUR' } },
        create: expect.objectContaining({
          totalAmount: 20,
          platformBreakdown: { royalty: 20 },
        }),
      }),
    );
  });

  it('uses the previous UTC month and exclusive next-month boundary', async () => {
    prisma.earning.findMany.mockResolvedValue([]);

    await service.handleMonthlyEarningsCron();

    expect(prisma.earning.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          date: expect.objectContaining({
            gte: expect.any(Date),
          }),
        }),
      }),
    );
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
