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
    it('calls payoutsService.getPayouts with userId and status', async () => {
      const mockPayouts = [{ id: 1, amount: 100, status: 'completed' }];
      payoutsService.getPayouts.mockResolvedValue(mockPayouts);

      const req = { user: { userId: 5 } } as any;
      const result = await controller.listPayouts(req, 'completed');

      expect(payoutsService.getPayouts).toHaveBeenCalledWith(5, 'completed');
      expect(result).toEqual(mockPayouts);
    });

    it('calls payoutsService.getPayouts with undefined status if not provided', async () => {
      payoutsService.getPayouts.mockResolvedValue([]);

      const req = { user: { userId: 5 } } as any;
      await controller.listPayouts(req, undefined);

      expect(payoutsService.getPayouts).toHaveBeenCalledWith(5, undefined);
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
