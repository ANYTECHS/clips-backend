import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EarningsController } from './earnings.controller';
import { EarningsService } from './earnings.service';

describe('EarningsController', () => {
  let controller: EarningsController;

  const mockEarningsService = {
    exportEarningsCsv: jest.fn(),
    getEarningsDashboard: jest.fn(),
    softDelete: jest.fn(),
    getLeaderboard: jest.fn(),
    getEarningsByPlatform: jest.fn(),
  };

  const mockRequest = (userId: number) =>
    ({ user: { userId } }) as Parameters<
      EarningsController['exportEarnings']
    >[0];

  const mockResponse = () => {
    const res: {
      setHeader: jest.Mock;
      send: jest.Mock;
    } = {
      setHeader: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    };
    return res;
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [EarningsController],
      providers: [
        { provide: EarningsService, useValue: mockEarningsService },
      ],
    }).compile();

    controller = module.get<EarningsController>(EarningsController);
    jest.clearAllMocks();
  });

  describe('exportEarnings', () => {
    it('streams a CSV attachment with date and amount columns', async () => {
      const csv =
        'date,clip title,amount,currency,source,transactionId\n' +
        '2024-06-01T00:00:00.000Z,Summer Clip,25.5,USD,royalty,';

      mockEarningsService.exportEarningsCsv.mockResolvedValue({
        filename: 'earnings-export-2024-06-01.csv',
        content: csv,
      });

      const res = mockResponse();
      await controller.exportEarnings(
        mockRequest(7),
        res as never,
        '2024-01-01',
        '2024-12-31',
        'csv',
      );

      expect(mockEarningsService.exportEarningsCsv).toHaveBeenCalledWith(7, {
        startDate: '2024-01-01',
        endDate: '2024-12-31',
      });
      expect(res.setHeader).toHaveBeenCalledWith(
        'Content-Type',
        'text/csv; charset=utf-8',
      );
      expect(res.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        'attachment; filename="earnings-export-2024-06-01.csv"',
      );
      expect(res.send).toHaveBeenCalledWith(csv);
    });

    it('rejects unsupported export formats', async () => {
      const res = mockResponse();

      await expect(
        controller.exportEarnings(
          mockRequest(1),
          res as never,
          undefined,
          undefined,
          'pdf',
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
