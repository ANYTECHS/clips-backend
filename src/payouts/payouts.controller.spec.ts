import { BadRequestException, ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PayoutsController } from './payouts.controller';
import { PayoutsService } from './payouts.service';
import { BalanceService } from './balance.service';
import { FeeService } from './fee.service';
import { PayoutExportService } from './payout-export.service';

describe('PayoutsController', () => {
  let controller: PayoutsController;
  let payoutsService: any;
  let balanceService: any;

  beforeEach(async () => {
    payoutsService = {
      getPayouts: jest.fn(),
      getPayoutById: jest.fn(),
      requestPayoutWithDetails: jest.fn(),
    };
    balanceService = {
      getAvailableBalance: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PayoutsController],
      providers: [
        { provide: PayoutsService, useValue: payoutsService },
        { provide: BalanceService, useValue: balanceService },
        {
          provide: FeeService,
          useValue: { previewFee: jest.fn(), calculateFee: jest.fn() },
        },
        {
          provide: PayoutExportService,
          useValue: { exportPayouts: jest.fn() },
        },
      ],
    }).compile();

    controller = module.get<PayoutsController>(PayoutsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('listPayouts', () => {
    it('calls payoutsService.getPayouts with userId, status, and pagination', async () => {
      const mockPage = {
        items: [{ id: 1, amount: 100, status: 'completed' }],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
        hasNextPage: false,
        hasPrevPage: false,
      };
      payoutsService.getPayouts.mockResolvedValue(mockPage);

      const req = { user: { userId: 5 } } as any;
      const result = await controller.listPayouts(req, {
        status: 'completed',
        page: 1,
        limit: 20,
      });

      expect(payoutsService.getPayouts).toHaveBeenCalledWith(
        5,
        'completed',
        1,
        20,
      );
      expect(result).toEqual(mockPage);
    });

    it('calls payoutsService.getPayouts with defaults when query is empty', async () => {
      payoutsService.getPayouts.mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        limit: 20,
        totalPages: 0,
        hasNextPage: false,
        hasPrevPage: false,
      });

      const req = { user: { userId: 5 } } as any;
      await controller.listPayouts(req, {});

      expect(payoutsService.getPayouts).toHaveBeenCalledWith(
        5,
        undefined,
        1,
        20,
      );
    });
  });

  describe('getPayout', () => {
    it('calls payoutsService.getPayoutById with userId and payoutId', async () => {
      const mockPayout = { id: 10, amount: 50, status: 'pending' };
      payoutsService.getPayoutById.mockResolvedValue(mockPayout);

      const req = { user: { userId: 5 } } as any;
      const result = await controller.getPayout(req, 10);

      expect(payoutsService.getPayoutById).toHaveBeenCalledWith(5, 10);
      expect(result).toEqual(mockPayout);
    });
  });

  describe('split payout endpoints (Issue #1279)', () => {
    const mockSplitResponse = {
      payouts: [
        {
          payoutId: 'payout_124',
          status: 'pending',
          id: 124,
          amount: 70,
          currency: 'USD',
          method: 'fiat',
        },
        {
          payoutId: 'payout_125',
          status: 'pending',
          id: 125,
          amount: 30,
          currency: 'USD',
          method: 'stellar',
        },
      ],
      totalAmount: 100,
      currency: 'USD',
    };

    it('passes destinations to requestPayoutWithDetails in requestPayout', async () => {
      payoutsService.requestPayoutWithDetails.mockResolvedValue(mockSplitResponse);

      const req = { user: { userId: 5 } } as any;
      const dto = {
        amount: 100,
        currency: 'USD',
        destinations: [
          { method: 'fiat' as const, percentage: 70 },
          { method: 'stellar' as const, percentage: 30 },
        ],
      };

      const result = await controller.requestPayout(req, dto);

      expect(payoutsService.requestPayoutWithDetails).toHaveBeenCalledWith(
        5,
        100,
        'USD',
        undefined,
        dto.destinations,
      );
      expect(result).toEqual(mockSplitResponse);
    });

    it('passes destinations to requestPayoutWithDetails in requestSplitPayout', async () => {
      payoutsService.requestPayoutWithDetails.mockResolvedValue(mockSplitResponse);

      const req = { user: { userId: 5 } } as any;
      const dto = {
        amount: 100,
        currency: 'USD',
        destinations: [
          { method: 'fiat' as const, percentage: 70 },
          { method: 'stellar' as const, percentage: 30 },
        ],
      };

      const result = await controller.requestSplitPayout(req, dto);

      expect(payoutsService.requestPayoutWithDetails).toHaveBeenCalledWith(
        5,
        100,
        'USD',
        undefined,
        dto.destinations,
      );
      expect(result).toEqual(mockSplitResponse);
    });

    it('propagates BadRequestException when split percentages do not sum to 100', async () => {
      payoutsService.requestPayoutWithDetails.mockRejectedValue(
        new BadRequestException('Destination percentages must sum to 100. Received: 90'),
      );

      const req = { user: { userId: 5 } } as any;
      const dto = {
        amount: 100,
        currency: 'USD',
        destinations: [
          { method: 'fiat' as const, percentage: 60 },
          { method: 'stellar' as const, percentage: 30 },
        ],
      };

      await expect(controller.requestSplitPayout(req, dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('propagates BadRequestException on insufficient balance for split payout', async () => {
      payoutsService.requestPayoutWithDetails.mockRejectedValue(
        new BadRequestException('Insufficient balance. Available: 80 USD'),
      );

      const req = { user: { userId: 5 } } as any;
      const dto = {
        amount: 100,
        currency: 'USD',
        destinations: [
          { method: 'fiat' as const, percentage: 70 },
          { method: 'stellar' as const, percentage: 30 },
        ],
      };

      await expect(controller.requestSplitPayout(req, dto)).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
