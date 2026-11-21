import {
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { BalanceService } from './balance.service';
import { PrismaService } from '../prisma/prisma.service';
import { PayoutValidationService } from './payout-validation.service';

describe('BalanceService', () => {
  let service: BalanceService;
  let prisma: any;
  let validationService: any;

  beforeEach(async () => {
    prisma = {
      user: {
        findUnique: jest.fn(),
      },
      earning: {
        aggregate: jest.fn(),
      },
      payout: {
        aggregate: jest.fn(),
        create: jest.fn(),
      },
      withTransaction: jest.fn((callback) => callback(prisma)),
    };

    validationService = {
      assertPayoutLimits: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BalanceService,
        { provide: PrismaService, useValue: prisma },
        { provide: PayoutValidationService, useValue: validationService },
      ],
    }).compile();

    service = module.get(BalanceService);
  });

  describe('getAvailableBalance', () => {
    it('calculates available balance correctly', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 1 });
      prisma.earning.aggregate.mockResolvedValue({
        _sum: { amountInBaseCurrency: 500 },
      });
      prisma.payout.aggregate
        .mockResolvedValueOnce({
          _sum: { finalAmount: 100 },
        })
        .mockResolvedValueOnce({
          _sum: { amount: 50 },
        });

      const result = await service.getAvailableBalance(1);

      expect(result).toEqual({
        totalEarnings: 500,
        totalPaidOut: 100,
        totalPending: 50,
        availableBalance: 350,
      });
    });

    it('handles zero earnings', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 1 });
      prisma.earning.aggregate.mockResolvedValue({
        _sum: { amountInBaseCurrency: null },
      });
      prisma.payout.aggregate
        .mockResolvedValueOnce({
          _sum: { finalAmount: null },
        })
        .mockResolvedValueOnce({
          _sum: { amount: null },
        });

      const result = await service.getAvailableBalance(1);

      expect(result.totalEarnings).toBe(0);
      expect(result.totalPaidOut).toBe(0);
      expect(result.totalPending).toBe(0);
      expect(result.availableBalance).toBe(0);
    });

    it('prevents negative available balance', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 1 });
      prisma.earning.aggregate.mockResolvedValue({
        _sum: { amountInBaseCurrency: 100 },
      });
      prisma.payout.aggregate
        .mockResolvedValueOnce({
          _sum: { finalAmount: 80 },
        })
        .mockResolvedValueOnce({
          _sum: { amount: 40 },
        });

      const result = await service.getAvailableBalance(1);

      expect(result.availableBalance).toBe(0); // clamped to 0
    });

    it('throws NotFoundException for non-existent user', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.getAvailableBalance(999)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('excludes soft-deleted earnings from total', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 1 });
      prisma.earning.aggregate.mockResolvedValue({
        _sum: { amountInBaseCurrency: 500 },
      });

      await service.getAvailableBalance(1);

      expect(prisma.earning.aggregate).toHaveBeenCalledWith({
        where: {
          clip: { video: { userId: 1 } },
          deletedAt: null,
        },
        _sum: { amountInBaseCurrency: true },
      });
    });

    it('includes only completed payouts in paid total', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 1 });
      prisma.earning.aggregate.mockResolvedValue({
        _sum: { amountInBaseCurrency: 500 },
      });
      prisma.payout.aggregate
        .mockResolvedValueOnce({
          _sum: { finalAmount: 100 },
        })
        .mockResolvedValueOnce({
          _sum: { amount: 50 },
        });

      await service.getAvailableBalance(1);

      const [paidCall] = prisma.payout.aggregate.mock.calls;
      expect(paidCall[0].where).toEqual({
        userId: 1,
        status: 'completed',
      });
    });

    it('includes pending payouts in pending total', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 1 });
      prisma.earning.aggregate.mockResolvedValue({
        _sum: { amountInBaseCurrency: 500 },
      });
      prisma.payout.aggregate
        .mockResolvedValueOnce({
          _sum: { finalAmount: 100 },
        })
        .mockResolvedValueOnce({
          _sum: { amount: 50 },
        });

      await service.getAvailableBalance(1);

      const [, pendingCall] = prisma.payout.aggregate.mock.calls;
      expect(pendingCall[0].where.status).toContain('pending');
      expect(pendingCall[0].where.status).toContain('processing');
    });
  });

  describe('validatePayoutAmount', () => {
    beforeEach(() => {
      validationService.assertPayoutLimits.mockImplementation(() => {
        // No validation errors
      });
    });

    it('rejects zero or negative amounts', async () => {
      await expect(
        service.validatePayoutAmount(1, 0),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.validatePayoutAmount(1, -50),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects amount exceeding available balance', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 1 });
      prisma.earning.aggregate.mockResolvedValue({
        _sum: { amountInBaseCurrency: 500 },
      });
      prisma.payout.aggregate
        .mockResolvedValueOnce({
          _sum: { finalAmount: 100 },
        })
        .mockResolvedValueOnce({
          _sum: { amount: 50 },
        });

      await expect(
        service.validatePayoutAmount(1, 400), // 400 > 350 available
      ).rejects.toThrow(BadRequestException);
    });

    it('accepts valid amount within balance', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 1 });
      prisma.earning.aggregate.mockResolvedValue({
        _sum: { amountInBaseCurrency: 500 },
      });
      prisma.payout.aggregate
        .mockResolvedValueOnce({
          _sum: { finalAmount: 100 },
        })
        .mockResolvedValueOnce({
          _sum: { amount: 50 },
        });

      await expect(
        service.validatePayoutAmount(1, 300),
      ).resolves.toBeUndefined();
    });

    it('validates amount against limits', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 1 });
      prisma.earning.aggregate.mockResolvedValue({
        _sum: { amountInBaseCurrency: 500 },
      });
      prisma.payout.aggregate
        .mockResolvedValueOnce({
          _sum: { finalAmount: 0 },
        })
        .mockResolvedValueOnce({
          _sum: { amount: 0 },
        });

      await service.validatePayoutAmount(1, 100, 'USD');

      expect(validationService.assertPayoutLimits).toHaveBeenCalledWith(
        100,
        'USD',
      );
    });

    it('includes balance breakdown in error message', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 1 });
      prisma.earning.aggregate.mockResolvedValue({
        _sum: { amountInBaseCurrency: 500 },
      });
      prisma.payout.aggregate
        .mockResolvedValueOnce({
          _sum: { finalAmount: 100 },
        })
        .mockResolvedValueOnce({
          _sum: { amount: 50 },
        });

      try {
        await service.validatePayoutAmount(1, 400);
        fail('Should have thrown BadRequestException');
      } catch (err) {
        expect(err.message).toContain('exceeds available balance');
        expect(err.message).toContain('$350');
        expect(err.message).toContain('500'); // total earnings
        expect(err.message).toContain('100'); // paid out
        expect(err.message).toContain('50'); // pending
      }
    });
  });

  describe('reserveBalance', () => {
    beforeEach(() => {
      validationService.assertPayoutLimits.mockImplementation(() => {
        // No validation errors
      });
    });

    it('creates payout with reserved amount', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 1 });
      prisma.earning.aggregate.mockResolvedValue({
        _sum: { amountInBaseCurrency: 500 },
      });
      prisma.payout.aggregate
        .mockResolvedValueOnce({
          _sum: { finalAmount: 0 },
        })
        .mockResolvedValueOnce({
          _sum: { amount: 0 },
        });
      prisma.payout.create.mockResolvedValue({
        id: 123,
        userId: 1,
        amount: 200,
        status: 'pending',
      });

      const payoutId = await service.reserveBalance(1, 200);

      expect(payoutId).toBe(123);
      expect(prisma.payout.create).toHaveBeenCalledWith({
        data: {
          userId: 1,
          amount: 200,
          currency: 'USD',
          method: 'bank_transfer',
          status: 'pending',
          payoutMethodId: undefined,
          walletId: undefined,
        },
      });
    });

    it('creates stellar payout when walletId provided', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 1 });
      prisma.earning.aggregate.mockResolvedValue({
        _sum: { amountInBaseCurrency: 500 },
      });
      prisma.payout.aggregate
        .mockResolvedValueOnce({
          _sum: { finalAmount: 0 },
        })
        .mockResolvedValueOnce({
          _sum: { amount: 0 },
        });
      prisma.payout.create.mockResolvedValue({
        id: 123,
        userId: 1,
        amount: 200,
        method: 'stellar',
        status: 'pending',
      });

      await service.reserveBalance(1, 200, undefined, 5);

      expect(prisma.payout.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          method: 'stellar',
          walletId: 5,
        }),
      });
    });

    it('validates amount before reservation', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 1 });
      prisma.earning.aggregate.mockResolvedValue({
        _sum: { amountInBaseCurrency: 100 },
      });
      prisma.payout.aggregate
        .mockResolvedValueOnce({
          _sum: { finalAmount: 0 },
        })
        .mockResolvedValueOnce({
          _sum: { amount: 0 },
        });

      await expect(
        service.reserveBalance(1, 200), // exceeds balance
      ).rejects.toThrow(BadRequestException);
      expect(prisma.payout.create).not.toHaveBeenCalled();
    });

    it('uses transaction for reservation', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 1 });
      prisma.earning.aggregate.mockResolvedValue({
        _sum: { amountInBaseCurrency: 500 },
      });
      prisma.payout.aggregate
        .mockResolvedValueOnce({
          _sum: { finalAmount: 0 },
        })
        .mockResolvedValueOnce({
          _sum: { amount: 0 },
        });
      prisma.payout.create.mockResolvedValue({
        id: 123,
        userId: 1,
        amount: 200,
        status: 'pending',
      });

      await service.reserveBalance(1, 200);

      expect(prisma.withTransaction).toHaveBeenCalled();
    });
  });

  describe('canProcessConcurrent', () => {
    it('returns true when total requested fits in balance', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 1 });
      prisma.earning.aggregate.mockResolvedValue({
        _sum: { amountInBaseCurrency: 500 },
      });
      prisma.payout.aggregate
        .mockResolvedValueOnce({
          _sum: { finalAmount: 0 },
        })
        .mockResolvedValueOnce({
          _sum: { amount: 0 },
        });

      const result = await service.canProcessConcurrent(1, [100, 100, 100]);

      expect(result).toBe(true);
    });

    it('returns false when total requested exceeds balance', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 1 });
      prisma.earning.aggregate.mockResolvedValue({
        _sum: { amountInBaseCurrency: 500 },
      });
      prisma.payout.aggregate
        .mockResolvedValueOnce({
          _sum: { finalAmount: 0 },
        })
        .mockResolvedValueOnce({
          _sum: { amount: 0 },
        });

      const result = await service.canProcessConcurrent(1, [300, 300]);

      expect(result).toBe(false);
    });

    it('handles empty amounts array', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 1 });
      prisma.earning.aggregate.mockResolvedValue({
        _sum: { amountInBaseCurrency: 500 },
      });
      prisma.payout.aggregate
        .mockResolvedValueOnce({
          _sum: { finalAmount: 0 },
        })
        .mockResolvedValueOnce({
          _sum: { amount: 0 },
        });

      const result = await service.canProcessConcurrent(1, []);

      expect(result).toBe(true);
    });
  });

  describe('Partial Payout Scenarios', () => {
    beforeEach(() => {
      validationService.assertPayoutLimits.mockImplementation(() => {
        // No validation errors
      });
    });

    it('Scenario: User with $500 balance withdraws $200, $300 remains available', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 1 });

      // First check: get balance
      prisma.earning.aggregate.mockResolvedValue({
        _sum: { amountInBaseCurrency: 500 },
      });
      prisma.payout.aggregate
        .mockResolvedValueOnce({
          _sum: { finalAmount: 0 },
        })
        .mockResolvedValueOnce({
          _sum: { amount: 0 },
        });

      // Validate amount
      await service.validatePayoutAmount(1, 200);

      // Reserve amount
      prisma.payout.create.mockResolvedValue({
        id: 1,
        userId: 1,
        amount: 200,
        status: 'pending',
      });

      const payoutId = await service.reserveBalance(1, 200);

      expect(payoutId).toBe(1);

      // Second check: get updated balance
      prisma.earning.aggregate.mockResolvedValue({
        _sum: { amountInBaseCurrency: 500 },
      });
      prisma.payout.aggregate
        .mockResolvedValueOnce({
          _sum: { finalAmount: 0 },
        })
        .mockResolvedValueOnce({
          _sum: { amount: 200 }, // Now includes the pending payout
        });

      const updatedBalance = await service.getAvailableBalance(1);

      expect(updatedBalance.availableBalance).toBe(300);
      expect(updatedBalance.totalPending).toBe(200);
    });

    it('Scenario: User attempts to withdraw more than available balance', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 1 });
      prisma.earning.aggregate.mockResolvedValue({
        _sum: { amountInBaseCurrency: 500 },
      });
      prisma.payout.aggregate
        .mockResolvedValueOnce({
          _sum: { finalAmount: 100 },
        })
        .mockResolvedValueOnce({
          _sum: { amount: 50 },
        });

      // Available: 500 - 100 - 50 = 350
      // Request: 400
      await expect(
        service.validatePayoutAmount(1, 400),
      ).rejects.toThrow(BadRequestException);
    });

    it('Scenario: Multiple concurrent partial requests succeed within balance', async () => {
      // User has $500 balance
      // Request 1: $100 (remaining: $400)
      // Request 2: $150 (remaining: $250)
      // Request 3: $150 (remaining: $100)
      // Total: $400

      prisma.user.findUnique.mockResolvedValue({ id: 1 });
      prisma.earning.aggregate.mockResolvedValue({
        _sum: { amountInBaseCurrency: 500 },
      });
      prisma.payout.aggregate
        .mockResolvedValueOnce({
          _sum: { finalAmount: 0 },
        })
        .mockResolvedValueOnce({
          _sum: { amount: 0 },
        });

      const requests = [100, 150, 150];
      const canProcess = await service.canProcessConcurrent(1, requests);

      expect(canProcess).toBe(true);
    });

    it('Scenario: Concurrent requests with insufficient balance', async () => {
      // User has $500 balance
      // Request 1: $300
      // Request 2: $300
      // Total: $600 > $500 (insufficient)

      prisma.user.findUnique.mockResolvedValue({ id: 1 });
      prisma.earning.aggregate.mockResolvedValue({
        _sum: { amountInBaseCurrency: 500 },
      });
      prisma.payout.aggregate
        .mockResolvedValueOnce({
          _sum: { finalAmount: 0 },
        })
        .mockResolvedValueOnce({
          _sum: { amount: 0 },
        });

      const requests = [300, 300];
      const canProcess = await service.canProcessConcurrent(1, requests);

      expect(canProcess).toBe(false);
    });
  });
});
