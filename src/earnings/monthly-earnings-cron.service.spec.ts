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
  });
});
