import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EarningsController } from './earnings.controller';
import { EarningsService } from './earnings.service';
import { EarningsAggregationService } from './earnings-aggregation.service';
import { EarningsExportService } from './earnings-export.service';
import { LeaderboardService } from './leaderboard.service';
import { Currency } from './earnings.types';

describe('EarningsController', () => {
  let controller: EarningsController;

  const mockEarningsService = {
    getUserTotalEarnings: jest.fn(),
    getEarningsByPeriod: jest.fn(),
    refreshEarningsCache: jest.fn(),
    getAvailableBalance: jest.fn(),
    createEarning: jest.fn(),
  };

  const mockEarningsAggregationService = {
    getEarningsDashboard: jest.fn(),
    getUserTotalEarnings: jest.fn(),
    getEarningsByPeriod: jest.fn(),
    getEarningsByPlatform: jest.fn(),
    getLeaderboard: jest.fn(),
    softDelete: jest.fn(),
  };

  const mockEarningsExportService = {
    exportEarningsCsv: jest.fn(),
  };

  const mockLeaderboardService = {
    getLeaderboard: jest.fn(),
    getUserRank: jest.fn(),
    setLeaderboardVisibility: jest.fn(),
  };

  const mockRequest = (userId: number) =>
    ({ user: { userId } }) as any;

  const mockResponse = () => ({
    setHeader: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [EarningsController],
      providers: [
        { provide: EarningsService, useValue: mockEarningsService },
        { provide: EarningsAggregationService, useValue: mockEarningsAggregationService },
        { provide: EarningsExportService, useValue: mockEarningsExportService },
        { provide: LeaderboardService, useValue: mockLeaderboardService },
      ],
    }).compile();

    controller = module.get<EarningsController>(EarningsController);
    jest.clearAllMocks();
  });

  // ─── Dashboard ──────────────────────────────────────────────────────────

  describe('getEarningsDashboard', () => {
    it('delegates to EarningsAggregationService with defaults', async () => {
      const dashboardData = { totalEarned: 1000, currency: 'USD', history: [] };
      mockEarningsAggregationService.getEarningsDashboard.mockResolvedValue(dashboardData);

      const result = await controller.getEarningsDashboard(mockRequest(1));
      expect(mockEarningsAggregationService.getEarningsDashboard).toHaveBeenCalledWith(
        1,
        1,    // default page
        20,   // default limit
        Currency.USD,
      );
      expect(result).toEqual(dashboardData);
    });

    it('passes custom page, limit, and currency', async () => {
      mockEarningsAggregationService.getEarningsDashboard.mockResolvedValue({});
      await controller.getEarningsDashboard(mockRequest(2), 3, 50, Currency.EUR);
      expect(mockEarningsAggregationService.getEarningsDashboard).toHaveBeenCalledWith(
        2, 3, 50, Currency.EUR,
      );
    });
  });

  // ─── Total earnings ──────────────────────────────────────────────────────

  describe('getUserTotalEarnings', () => {
    it('delegates to EarningsAggregationService', async () => {
      const totals = { total: 500, currency: 'USD', breakdown: { royalties: 500, subscriptions: 0 } };
      mockEarningsAggregationService.getUserTotalEarnings.mockResolvedValue(totals);

      const result = await controller.getUserTotalEarnings(mockRequest(1));
      expect(mockEarningsAggregationService.getUserTotalEarnings).toHaveBeenCalledWith(1, Currency.USD);
      expect(result).toEqual(totals);
    });
  });

  // ─── By period ──────────────────────────────────────────────────────────

  describe('getEarningsByPeriod', () => {
    it('delegates to EarningsAggregationService with date range', async () => {
      mockEarningsAggregationService.getEarningsByPeriod.mockResolvedValue({ total: 200 });

      const result = await controller.getEarningsByPeriod(
        mockRequest(1),
        '2025-01-01',
        '2025-12-31',
      );
      expect(mockEarningsAggregationService.getEarningsByPeriod).toHaveBeenCalledWith(
        1,
        new Date('2025-01-01'),
        new Date('2025-12-31'),
        Currency.USD,
      );
      expect(result).toEqual({ total: 200 });
    });

    it('throws BadRequestException when dates are missing', async () => {
      await expect(
        controller.getEarningsByPeriod(mockRequest(1), '', ''),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── By platform ─────────────────────────────────────────────────────────

  describe('getEarningsByPlatform', () => {
    it('delegates to EarningsAggregationService', async () => {
      const platformData = { data: [], totalEarnings: 0 };
      mockEarningsAggregationService.getEarningsByPlatform.mockResolvedValue(platformData);

      const result = await controller.getEarningsByPlatform(mockRequest(1));
      expect(mockEarningsAggregationService.getEarningsByPlatform).toHaveBeenCalledWith(1);
      expect(result).toEqual(platformData);
    });
  });

  // ─── Export ──────────────────────────────────────────────────────────────

  describe('exportEarnings', () => {
    it('streams CSV with correct headers', async () => {
      const csv = 'date,clip title,amount,currency,source,transactionId\n2025-01-01T00:00:00.000Z,My Clip,25.5,USD,royalty,';
      mockEarningsExportService.exportEarningsCsv.mockResolvedValue({
        filename: 'earnings-export-2025-01-01.csv',
        content: csv,
      });

      const res = mockResponse();
      await controller.exportEarnings(mockRequest(7), res as any, '2025-01-01', '2025-12-31', 'csv');

      expect(mockEarningsExportService.exportEarningsCsv).toHaveBeenCalledWith(7, {
        startDate: '2025-01-01',
        endDate: '2025-12-31',
      });
      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv; charset=utf-8');
      expect(res.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        'attachment; filename="earnings-export-2025-01-01.csv"',
      );
      expect(res.send).toHaveBeenCalledWith(csv);
    });

    it('rejects unsupported export formats', async () => {
      const res = mockResponse();
      await expect(
        controller.exportEarnings(mockRequest(1), res as any, undefined, undefined, 'pdf'),
      ).rejects.toThrow(BadRequestException);
    });

    it('defaults to csv format when format is not provided', async () => {
      mockEarningsExportService.exportEarningsCsv.mockResolvedValue({
        filename: 'earnings.csv',
        content: 'data',
      });
      const res = mockResponse();
      await controller.exportEarnings(mockRequest(1), res as any);
      expect(mockEarningsExportService.exportEarningsCsv).toHaveBeenCalled();
    });
  });

  // ─── Leaderboard ─────────────────────────────────────────────────────────

  describe('getLeaderboard', () => {
    it('delegates to LeaderboardService', async () => {
      const leaderboard = { data: [], updatedAt: new Date().toISOString() };
      mockLeaderboardService.getLeaderboard.mockResolvedValue(leaderboard);

      const result = await controller.getLeaderboard(10);
      expect(mockLeaderboardService.getLeaderboard).toHaveBeenCalledWith(10);
      expect(result).toEqual(leaderboard);
    });
  });

  // ─── Soft delete ─────────────────────────────────────────────────────────

  describe('deleteEarning', () => {
    it('delegates soft-delete to EarningsAggregationService', async () => {
      mockEarningsAggregationService.softDelete.mockResolvedValue({ message: 'Earning deleted successfully' });

      const result = await controller.deleteEarning(mockRequest(1), 42);
      expect(mockEarningsAggregationService.softDelete).toHaveBeenCalledWith(42, 1);
      expect(result).toEqual({ message: 'Earning deleted successfully' });
    });
  });
});
