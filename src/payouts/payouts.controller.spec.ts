import { Test, TestingModule } from '@nestjs/testing';
import { PayoutsController } from './payouts.controller';
import { PayoutsService } from './payouts.service';
import { BalanceService } from './balance.service';

describe('PayoutsController', () => {
  let controller: PayoutsController;
  let payoutsService: any;
  let balanceService: any;

  beforeEach(async () => {
    payoutsService = {
      getPayouts: jest.fn(),
      getPayoutById: jest.fn(),
    };
    balanceService = {
      getAvailableBalance: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PayoutsController],
      providers: [
        { provide: PayoutsService, useValue: payoutsService },
        { provide: BalanceService, useValue: balanceService },
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
});
