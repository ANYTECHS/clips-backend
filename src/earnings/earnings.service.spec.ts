import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { EarningsService } from './earnings.service';
import { EarningsAggregationService } from './earnings-aggregation.service';
import { EarningsExportService } from './earnings-export.service';
import { Currency } from './earnings.types';

describe('EarningsService', () => {
  let service: EarningsService;
  let aggregationService: jest.Mocked<EarningsAggregationService>;
  let exportService: jest.Mocked<EarningsExportService>;

  beforeEach(async () => {
    aggregationService = {
      invalidateUserEarningsCache: jest.fn(),
      getUserTotalEarnings: jest.fn(),
      getEarningsByPeriod: jest.fn(),
      getEarningsDashboard: jest.fn(),
      softDelete: jest.fn(),
      getLeaderboard: jest.fn(),
      getEarningsByPlatform: jest.fn(),
    } as unknown as jest.Mocked<EarningsAggregationService>;

    exportService = {
      exportEarningsCsv: jest.fn(),
    } as unknown as jest.Mocked<EarningsExportService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EarningsService,
        { provide: EarningsAggregationService, useValue: aggregationService },
        { provide: EarningsExportService, useValue: exportService },
      ],
    }).compile();

    service = module.get<EarningsService>(EarningsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('delegates getUserTotalEarnings to aggregation service', async () => {
    aggregationService.getUserTotalEarnings.mockResolvedValue({
      total: 175,
      breakdown: { royalty: 125, subscription: 50 },
    } as any);

    const result = await service.getUserTotalEarnings(1);

    expect(aggregationService.getUserTotalEarnings).toHaveBeenCalledWith(
      1,
      Currency.USD,
    );
    expect(result.total).toBe(175);
  });

  it('delegates getEarningsByPeriod to aggregation service', async () => {
    const start = new Date('2024-01-01');
    const end = new Date('2024-01-31');
    aggregationService.getEarningsByPeriod.mockResolvedValue({ total: 42 } as any);

    const result = await service.getEarningsByPeriod(1, start, end);

    expect(aggregationService.getEarningsByPeriod).toHaveBeenCalledWith(
      1,
      start,
      end,
      Currency.USD,
    );
    expect(result.total).toBe(42);
  });

  it('delegates getEarningsDashboard to aggregation service', async () => {
    aggregationService.getEarningsDashboard.mockResolvedValue({
      totalEarnings: 100,
      earnings: [],
      pagination: { page: 1, limit: 20, total: 0 },
    } as any);

    const result = await service.getEarningsDashboard(1, 2, 10);

    expect(aggregationService.getEarningsDashboard).toHaveBeenCalledWith(
      1,
      2,
      10,
      Currency.USD,
    );
    expect(result.totalEarnings).toBe(100);
  });

  it('delegates softDelete to aggregation service', async () => {
    aggregationService.softDelete.mockResolvedValue({
      message: 'Earning deleted successfully',
    });

    const result = await service.softDelete(1, 1);

    expect(aggregationService.softDelete).toHaveBeenCalledWith(1, 1);
    expect(result.message).toBe('Earning deleted successfully');
  });

  it('delegates getLeaderboard to aggregation service', async () => {
    aggregationService.getLeaderboard.mockResolvedValue([
      { rank: 1, label: 'creator-1', totalEarned: 500 },
    ]);

    const result = await service.getLeaderboard(2);

    expect(aggregationService.getLeaderboard).toHaveBeenCalledWith(2);
    expect(result).toHaveLength(1);
  });

  it('delegates exportEarningsCsv to export service', async () => {
    exportService.exportEarningsCsv.mockResolvedValue({
      filename: 'earnings.csv',
      content: 'date,amount\n',
    });

    const result = await service.exportEarningsCsv(1, { startDate: '2024-01-01' });

    expect(exportService.exportEarningsCsv).toHaveBeenCalledWith(1, {
      startDate: '2024-01-01',
    });
    expect(result.filename).toBe('earnings.csv');
  });

  it('propagates export validation errors', async () => {
    exportService.exportEarningsCsv.mockRejectedValue(
      new BadRequestException('Invalid date range'),
    );

    await expect(
      service.exportEarningsCsv(1, { startDate: '2024-01-01' }),
    ).rejects.toThrow(BadRequestException);
  });
});
