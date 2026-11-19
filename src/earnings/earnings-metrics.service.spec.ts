import { Test, TestingModule } from '@nestjs/testing';
import { EarningsMetricsService } from './earnings-metrics.service';
import { PrismaService } from '../prisma/prisma.service';
import { CurrencyConversionService } from './currency-conversion.service';
import { Currency } from './earnings.types';

describe('EarningsMetricsService', () => {
  let service: EarningsMetricsService;

  const mockPrisma = {
    earning: { findMany: jest.fn() },
    payout: { findMany: jest.fn() },
  };

  const mockConversion = {
    convert: jest.fn(
      (amount: number, _from: Currency, _to: Currency) => amount,
    ),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EarningsMetricsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: CurrencyConversionService, useValue: mockConversion },
      ],
    }).compile();

    service = module.get(EarningsMetricsService);
    jest.clearAllMocks();
  });

  it('returns monthly earnings, growth percentage, and pending payouts', async () => {
    mockPrisma.earning.findMany
      .mockResolvedValueOnce([{ amount: 300, currency: 'USD' }])
      .mockResolvedValueOnce([{ amount: 200, currency: 'USD' }]);
    mockPrisma.payout.findMany.mockResolvedValue([
      { amount: 50, currency: 'USD' },
      { amount: 25, currency: 'USD' },
    ]);

    const metrics = await service.getDashboardMetrics(4, Currency.USD);

    expect(metrics.monthlyEarnings).toBe(300);
    expect(metrics.growthPercentage).toBe(50);
    expect(metrics.pendingPayouts).toBe(75);
    expect(metrics.currency).toBe(Currency.USD);
    expect(metrics.period.currentMonth).toMatch(/^\d{4}-\d{2}$/);
    expect(metrics.period.previousMonth).toMatch(/^\d{4}-\d{2}$/);
  });

  it('reports zero growth when both months have no earnings', async () => {
    mockPrisma.earning.findMany.mockResolvedValue([]);
    mockPrisma.payout.findMany.mockResolvedValue([]);

    const metrics = await service.getDashboardMetrics(1);

    expect(metrics.monthlyEarnings).toBe(0);
    expect(metrics.growthPercentage).toBe(0);
    expect(metrics.pendingPayouts).toBe(0);
  });
});
