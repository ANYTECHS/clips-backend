import { BadRequestException, ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { PayoutsService } from './payouts.service';
import { PrismaService } from '../prisma/prisma.service';
import { StellarService } from '../stellar/stellar.service';
import { PayoutReceiptService } from './payout-receipt.service';
import { FeeService } from './fee.service';
import { PAYOUT_RETRY_QUEUE } from './payout-retry.queue';
import { PayoutApprovalService } from './payout-approval.service';
import { EarningsService } from '../earnings/earnings.service';
import { ConfigService } from '../config/config.service';
import { CurrencyService } from '../common/services/currency.service';
import { PayoutLimitsService } from './payout-limits.service';
import { PayoutValidationService } from './payout-validation.service';
import { PayoutProcessingService } from './payout-processing.service';

/**
 * Focused coverage for Issues #980 / #981 — payout request + fiat/crypto split.
 */
describe('PayoutsService split & request (Issues #980 / #981)', () => {
  let service: PayoutsService;

  const mockPrisma: any = {
    payout: {
      findFirst: jest.fn(),
      create: jest.fn(),
      aggregate: jest.fn(),
    },
    wallet: { findFirst: jest.fn() },
    payoutMethod: { findFirst: jest.fn() },
    earning: { aggregate: jest.fn() },
    $transaction: jest.fn(),
  };

  const mockEarningsService = {
    getUserTotalEarnings: jest.fn().mockResolvedValue({
      totalEarned: 500,
      totalPaidOut: 0,
      availableBalance: 500,
      currency: 'USD',
    }),
  };

  const mockFeeService = {
    calculateFee: jest.fn().mockResolvedValue({
      feeAmount: 0,
      feePercentage: 0,
      finalAmount: 50,
    }),
  };

  const mockValidation = {
    assertMinimumPayout: jest.fn().mockResolvedValue(undefined),
    assertPayoutLimits: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockPrisma));
    mockPrisma.payout.findFirst.mockResolvedValue(null);
    mockPrisma.wallet.findFirst.mockResolvedValue({ id: 10, address: 'GTEST' });
    mockPrisma.payoutMethod.findFirst.mockResolvedValue({ id: 20 });
    mockPrisma.payout.create
      .mockResolvedValueOnce({
        id: 123,
        amount: 50,
        currency: 'USD',
        method: 'stellar',
        status: 'pending',
        createdAt: new Date('2026-09-27T00:00:00Z'),
        feeAmount: 0,
        finalAmount: 50,
      })
      .mockResolvedValue({
        id: 999,
        amount: 1,
        currency: 'USD',
        method: 'stellar',
        status: 'pending',
        createdAt: new Date(),
        feeAmount: 0,
        finalAmount: 1,
      });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PayoutsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: StellarService, useValue: {} },
        { provide: PayoutReceiptService, useValue: {} },
        { provide: EarningsService, useValue: mockEarningsService },
        { provide: FeeService, useValue: mockFeeService },
        {
          provide: PayoutApprovalService,
          useValue: { resolveInitialStatus: jest.fn().mockReturnValue('pending') },
        },
        { provide: ConfigService, useValue: { minStellarPayout: 5 } },
        { provide: PayoutLimitsService, useValue: {} },
        { provide: CurrencyService, useValue: { convert: jest.fn() } },
        { provide: getQueueToken(PAYOUT_RETRY_QUEUE), useValue: { add: jest.fn() } },
        { provide: PayoutValidationService, useValue: mockValidation },
        { provide: PayoutProcessingService, useValue: {} },
      ],
    }).compile();

    service = module.get(PayoutsService);
  });

  it('creates a single pending payout and returns payoutId (#980)', async () => {
    const result = await service.requestPayoutWithDetails(
      1,
      50,
      'USD',
      'stellar',
    );

    expect(result).toEqual(
      expect.objectContaining({
        payoutId: 'payout_123',
        status: 'pending',
        id: 123,
        amount: 50,
        method: 'stellar',
      }),
    );
    expect(mockPrisma.payout.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.$transaction).toHaveBeenCalled();
  });

  it('creates separate payout records for a percentage split (#981)', async () => {
    mockPrisma.payout.create
      .mockReset()
      .mockResolvedValueOnce({
        id: 1,
        amount: 70,
        currency: 'USD',
        method: 'fiat',
        status: 'pending',
        createdAt: new Date(),
        feeAmount: 0,
        finalAmount: 70,
      })
      .mockResolvedValueOnce({
        id: 2,
        amount: 30,
        currency: 'USD',
        method: 'stellar',
        status: 'pending',
        createdAt: new Date(),
        feeAmount: 0,
        finalAmount: 30,
      });

    const result = await service.requestPayoutWithDetails(1, 100, 'USD', undefined, [
      { method: 'fiat', percentage: 70 },
      { method: 'stellar', percentage: 30 },
    ]);

    expect(result).toEqual({
      payouts: [
        expect.objectContaining({
          payoutId: 'payout_1',
          status: 'pending',
          method: 'fiat',
          amount: 70,
        }),
        expect.objectContaining({
          payoutId: 'payout_2',
          status: 'pending',
          method: 'stellar',
          amount: 30,
        }),
      ],
      totalAmount: 100,
      currency: 'USD',
    });
    expect(mockPrisma.payout.create).toHaveBeenCalledTimes(2);
  });

  it('rejects splits whose percentages do not sum to 100', async () => {
    await expect(
      service.requestPayoutWithDetails(1, 100, 'USD', undefined, [
        { method: 'fiat', percentage: 60 },
        { method: 'stellar', percentage: 30 },
      ]),
    ).rejects.toThrow(BadRequestException);
    expect(mockPrisma.payout.create).not.toHaveBeenCalled();
  });

  it('rejects when available balance is insufficient', async () => {
    mockEarningsService.getUserTotalEarnings.mockResolvedValueOnce({
      totalEarned: 10,
      totalPaidOut: 0,
      availableBalance: 10,
      currency: 'USD',
    });

    await expect(
      service.requestPayoutWithDetails(1, 50, 'USD', 'stellar'),
    ).rejects.toThrow(/Insufficient balance/);
  });

  it('rejects duplicate open payout requests', async () => {
    mockPrisma.payout.findFirst.mockResolvedValueOnce({ id: 9, status: 'pending' });

    await expect(
      service.requestPayoutWithDetails(1, 50, 'USD', 'stellar'),
    ).rejects.toThrow(ConflictException);
  });

  it('rejects absolute-amount splits that do not equal the total', async () => {
    await expect(
      service.requestPayoutWithDetails(1, 100, 'USD', undefined, [
        { method: 'fiat', amount: 40 },
        { method: 'stellar', amount: 50 },
      ]),
    ).rejects.toThrow(/must sum to 100/);
  });
});
