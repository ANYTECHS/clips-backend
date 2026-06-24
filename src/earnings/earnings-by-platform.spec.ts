import { Test, TestingModule } from '@nestjs/testing';
import { EarningsService } from './earnings.service';
import { EarningsAggregationService } from './earnings-aggregation.service';
import { EarningsExportService } from './earnings-export.service';

describe('EarningsService - getEarningsByPlatform', () => {
  let service: EarningsService;
  let aggregationService: EarningsAggregationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EarningsService,
        {
          provide: EarningsAggregationService,
          useValue: {
            getEarningsByPlatform: jest.fn(),
          },
        },
        {
          provide: EarningsExportService,
          useValue: {
            exportEarningsCsv: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<EarningsService>(EarningsService);
    aggregationService = module.get<EarningsAggregationService>(EarningsAggregationService);
  });

  it('should group earnings by platform', async () => {
    const mockResult = {
      totalEarnings: 500,
      data: [
        { platform: 'tiktok', totalEarnings: 300, count: 2 },
        { platform: 'instagram', totalEarnings: 150, count: 1 },
        { platform: 'youtube', totalEarnings: 50, count: 1 },
      ],
    };

    jest
      .spyOn(aggregationService, 'getEarningsByPlatform')
      .mockResolvedValue(mockResult as any);

    const result = await service.getEarningsByPlatform(1);

    expect(result.totalEarnings).toBe(500);
    expect(result.data).toHaveLength(3);
    expect(result.data[0]).toEqual({
      platform: 'tiktok',
      totalEarnings: 300,
      count: 2,
    });
    expect(result.data[1]).toEqual({
      platform: 'instagram',
      totalEarnings: 150,
      count: 1,
    });
    expect(result.data[2]).toEqual({
      platform: 'youtube',
      totalEarnings: 50,
      count: 1,
    });
  });

  it('should handle unknown platforms', async () => {
    jest.spyOn(aggregationService, 'getEarningsByPlatform').mockResolvedValue({
      totalEarnings: 150,
      data: [
        { platform: 'unknown', totalEarnings: 100, count: 1 },
        { platform: 'tiktok', totalEarnings: 50, count: 1 },
      ],
    } as any);

    const result = await service.getEarningsByPlatform(1);

    expect(result.data).toHaveLength(2);
    expect(result.data.find((d) => d.platform === 'unknown')).toEqual({
      platform: 'unknown',
      totalEarnings: 100,
      count: 1,
    });
  });

  it('should return empty data for user with no earnings', async () => {
    jest.spyOn(aggregationService, 'getEarningsByPlatform').mockResolvedValue({
      totalEarnings: 0,
      data: [],
    } as any);

    const result = await service.getEarningsByPlatform(1);

    expect(result.totalEarnings).toBe(0);
    expect(result.data).toHaveLength(0);
  });
});
