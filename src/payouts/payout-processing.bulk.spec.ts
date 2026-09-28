import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PayoutProcessingService } from './payout-processing.service';
import { PrismaService } from '../prisma/prisma.service';
import { StellarService } from '../stellar/stellar.service';
import { PayoutReceiptService } from './payout-receipt.service';
import { PayoutValidationService } from './payout-validation.service';
import { getQueueToken } from '@nestjs/bullmq';
import { PAYOUT_RETRY_QUEUE } from './payout-retry.queue';
import { MAX_BULK_PAYOUT_BATCH_SIZE } from './payouts.constants';

describe('PayoutProcessingService.batchProcessPayouts', () => {
  let service: PayoutProcessingService;
  let prisma: {
    $transaction: jest.Mock;
    payout: { findUnique: jest.Mock };
    earningsAuditLog: { create: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      $transaction: jest.fn(),
      payout: { findUnique: jest.fn() },
      earningsAuditLog: { create: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PayoutProcessingService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: StellarService,
          useValue: {
            horizonUrl: 'https://horizon-testnet.stellar.org',
            networkPassphrase: 'Test SDF Network ; September 2015',
            getTransactionStatus: jest.fn(),
            validateAddress: jest.fn(),
            getAccountBalance: jest.fn(),
          },
        },
        {
          provide: PayoutReceiptService,
          useValue: { generateAndSendReceipt: jest.fn() },
        },
        {
          provide: PayoutValidationService,
          useValue: {
            assertMinimumPayout: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: getQueueToken(PAYOUT_RETRY_QUEUE),
          useValue: { add: jest.fn() },
        },
      ],
    }).compile();

    service = module.get(PayoutProcessingService);
  });

  it('rejects empty batch', async () => {
    await expect(service.batchProcessPayouts([])).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects batches larger than max size', async () => {
    const ids = Array.from({ length: MAX_BULK_PAYOUT_BATCH_SIZE + 1 }, (_, i) => i + 1);
    await expect(service.batchProcessPayouts(ids)).rejects.toThrow(
      /Maximum batch size/,
    );
  });

  it('records partial failures without aborting the batch', async () => {
    prisma.$transaction
      .mockRejectedValueOnce(new NotFoundException('Payout record not found'))
      .mockRejectedValueOnce(
        new BadRequestException('Payout must be approved before processing'),
      );

    const result = await service.batchProcessPayouts([1, 2]);

    expect(result.processed).toBe(0);
    expect(result.failed).toBe(2);
    expect(result.results).toEqual([
      expect.objectContaining({ id: 1, status: 'failed' }),
      expect.objectContaining({ id: 2, status: 'failed' }),
    ]);
  });

  it('deduplicates payout IDs before processing', async () => {
    prisma.$transaction.mockRejectedValue(
      new NotFoundException('Payout record not found'),
    );

    const result = await service.batchProcessPayouts([5, 5, 5]);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(result.results).toHaveLength(1);
    expect(result.results[0].id).toBe(5);
  });
});
