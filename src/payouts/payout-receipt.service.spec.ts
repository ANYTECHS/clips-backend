import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { PayoutsService } from './payouts.service';
import { PrismaService } from '../prisma/prisma.service';
import { StellarService } from '../stellar/stellar.service';
import { PayoutReceiptService } from './payout-receipt.service';
import { EarningsService } from '../earnings/earnings.service';
import { FeeService } from './fee.service';
import { PayoutApprovalService } from './payout-approval.service';
import { ConfigService } from '../config/config.service';
import { PayoutLimitsService } from './payout-limits.service';
import { CurrencyService } from '../common/services/currency.service';
import { PayoutValidationService } from './payout-validation.service';
import { PayoutProcessingService } from './payout-processing.service';
import { PAYOUT_RETRY_QUEUE } from './payout-retry.queue';

describe('PayoutsService receipts', () => {
  let service: PayoutsService;
  let prisma: any;
  let receiptService: { getReceiptPdf: jest.Mock; getReceiptByPayoutId: jest.Mock };

  beforeEach(async () => {
    prisma = {
      payout: {
        findFirst: jest.fn(),
      },
      payoutReceipt: {
        findUnique: jest.fn(),
      },
    };
    receiptService = {
      getReceiptPdf: jest.fn().mockResolvedValue(Buffer.from('%PDF')),
      getReceiptByPayoutId: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PayoutsService,
        { provide: PrismaService, useValue: prisma },
        { provide: StellarService, useValue: {} },
        { provide: PayoutReceiptService, useValue: receiptService },
        { provide: EarningsService, useValue: {} },
        { provide: FeeService, useValue: {} },
        { provide: PayoutApprovalService, useValue: {} },
        { provide: ConfigService, useValue: {} },
        { provide: PayoutLimitsService, useValue: {} },
        { provide: CurrencyService, useValue: {} },
        { provide: PayoutValidationService, useValue: {} },
        { provide: PayoutProcessingService, useValue: {} },
        { provide: getQueueToken(PAYOUT_RETRY_QUEUE), useValue: { add: jest.fn() } },
      ],
    }).compile();

    service = module.get(PayoutsService);
  });

  it('returns 404 when payout is missing or not owned', async () => {
    prisma.payout.findFirst.mockResolvedValue(null);
    await expect(service.getPayoutReceiptPdf(1, 99)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('returns 409 when payout is not completed', async () => {
    prisma.payout.findFirst.mockResolvedValue({
      id: 1,
      status: 'approved',
      user: { email: 'a@b.com' },
      wallet: { address: 'GABC' },
    });

    await expect(service.getPayoutReceiptPdf(1, 1)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('returns 409 when receipt metadata is not yet available', async () => {
    prisma.payout.findFirst.mockResolvedValue({
      id: 1,
      status: 'completed',
      amount: 100,
      currency: 'USD',
      method: 'stellar',
      transactionId: 'tx',
      onChainTxHash: 'hash',
      confirmedAt: new Date(),
      paidAt: new Date(),
      user: { email: 'a@b.com' },
      wallet: { address: 'GABC' },
    });
    prisma.payoutReceipt.findUnique.mockResolvedValue(null);

    await expect(service.getPayoutReceiptPdf(1, 1)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('returns PDF buffer for completed payout with receipt', async () => {
    prisma.payout.findFirst.mockResolvedValue({
      id: 1,
      status: 'completed',
      amount: 100,
      currency: 'USD',
      method: 'stellar',
      feeAmount: 2.5,
      feePercentage: 2.5,
      finalAmount: 97.5,
      transactionId: 'tx',
      onChainTxHash: 'hash',
      confirmedAt: new Date(),
      paidAt: new Date(),
      user: { email: 'a@b.com' },
      wallet: { address: 'GABC' },
    });
    prisma.payoutReceipt.findUnique.mockResolvedValue({
      id: 1,
      payoutId: 1,
      receiptId: 'RCP-1',
    });

    const pdf = await service.getPayoutReceiptPdf(1, 1);
    expect(pdf.toString()).toContain('%PDF');
    expect(receiptService.getReceiptPdf).toHaveBeenCalled();
  });
});
