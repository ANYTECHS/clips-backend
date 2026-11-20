import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import * as StellarSdk from '@stellar/stellar-sdk';
import { PrismaService } from '../prisma/prisma.service';
import { StellarService } from '../stellar/stellar.service';
import { PayoutReceiptService } from './payout-receipt.service';
import { PayoutValidationService } from './payout-validation.service';
import { PayoutRetryStrategyService } from './payout-retry-strategy.service';
import { PayoutProcessingService } from './payout-processing.service';
import { PAYOUT_RETRY_QUEUE } from './payout-retry.queue';
import { StellarPayoutVerificationService } from './stellar-payout-verification.service';
import { STELLAR_CONFIRMATION_MAX_POLLS } from './stellar-confirmation.queue';

describe('PayoutProcessingService Stellar confirmation tracking', () => {
  let service: PayoutProcessingService;
  const prisma = {
    payout: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    earningsAuditLog: { create: jest.fn() },
  };
  const verification = { verifyPayoutTransaction: jest.fn() };
  const receipt = { generateAndSendReceipt: jest.fn() };
  const validation = {
    assertNotCompleted: jest.fn(),
    assertProcessable: jest.fn().mockResolvedValue({
      wallet: { address: 'GDEST' },
    }),
  };
  const retryQueue = { add: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PayoutProcessingService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: StellarService,
          useValue: {
            horizonUrl: 'https://horizon-testnet.stellar.org',
            networkPassphrase: 'Test SDF Network ; September 2015',
          },
        },
        { provide: PayoutReceiptService, useValue: receipt },
        { provide: PayoutValidationService, useValue: validation },
        {
          provide: PayoutRetryStrategyService,
          useValue: {
            shouldRetry: jest.fn().mockReturnValue(false),
            getNextRetryTime: jest.fn(),
            getMaxRetries: jest.fn().mockReturnValue(3),
          },
        },
        {
          provide: StellarPayoutVerificationService,
          useValue: verification,
        },
        { provide: getQueueToken(PAYOUT_RETRY_QUEUE), useValue: retryQueue },
      ],
    }).compile();

    service = module.get(PayoutProcessingService);
  });

  it('queries only unconfirmed Stellar payouts and includes confirmation data', async () => {
    prisma.payout.findMany.mockResolvedValue([]);

    await service.pollPendingStellarPayouts();

    expect(prisma.payout.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          method: 'stellar',
          status: { in: ['pending', 'processing'] },
          onChainTxHash: { not: null },
          confirmedAt: null,
        },
        select: expect.objectContaining({
          confirmationPollCount: true,
          wallet: { select: { address: true } },
        }),
      }),
    );
  });

  it('marks a verified payout completed and records confirmation timestamps', async () => {
    const confirmedAt = new Date('2026-10-20T10:00:00.000Z');
    prisma.payout.findMany.mockResolvedValue([
      {
        id: 3,
        onChainTxHash: 'tx-hash',
        confirmationPollCount: 1,
        userId: 42,
        amount: 25,
        finalAmount: 24,
        currency: 'USD',
        method: 'stellar',
        feeAmount: 1,
        feePercentage: 4,
        transactionId: 'internal-hash',
        wallet: { address: 'GDEST' },
        user: { email: 'creator@example.test' },
      },
    ]);
    verification.verifyPayoutTransaction.mockResolvedValue({
      outcome: 'confirmed',
      found: true,
      confirmedAt,
    });
    prisma.payout.updateMany.mockResolvedValue({ count: 1 });
    prisma.earningsAuditLog.create.mockResolvedValue({});

    await service.pollPendingStellarPayouts();

    expect(verification.verifyPayoutTransaction).toHaveBeenCalledWith(
      'tx-hash',
      expect.objectContaining({
        expectedDestination: 'GDEST',
        expectedAmount: 24,
        throwOnNotFound: false,
        throwOnConflict: false,
      }),
    );
    expect(prisma.payout.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'completed',
          confirmedAt,
          paidAt: confirmedAt,
          confirmationPollCount: 2,
          lastConfirmationCheckAt: expect.any(Date),
        }),
      }),
    );
    expect(receipt.generateAndSendReceipt).toHaveBeenCalledWith(
      expect.objectContaining({
        payoutId: 3,
        transactionId: 'internal-hash',
        onChainTxHash: 'tx-hash',
        confirmedAt,
        paidAt: confirmedAt,
      }),
    );
  });

  it('marks an unsuccessful Horizon transaction failed with a reason', async () => {
    prisma.payout.findMany.mockResolvedValue([
      {
        id: 4,
        onChainTxHash: 'tx-failed',
        confirmationPollCount: 0,
        userId: 42,
        amount: 25,
      },
    ]);
    verification.verifyPayoutTransaction.mockResolvedValue({
      outcome: 'failed',
      found: true,
    });
    prisma.payout.updateMany.mockResolvedValue({ count: 1 });

    await service.pollPendingStellarPayouts();

    expect(prisma.payout.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 4 }),
        data: expect.objectContaining({
          status: 'failed',
          failureReason: 'Stellar transaction failed on Horizon',
          confirmationPollCount: 1,
        }),
      }),
    );
  });

  it('counts not-found checks independently of payout execution retries', async () => {
    prisma.payout.findMany.mockResolvedValue([
      {
        id: 5,
        onChainTxHash: 'not-yet-indexed',
        confirmationPollCount: 2,
        userId: 42,
        amount: 25,
      },
    ]);
    verification.verifyPayoutTransaction.mockResolvedValue({
      outcome: 'unknown',
      found: false,
    });
    prisma.payout.updateMany.mockResolvedValue({ count: 1 });

    await service.pollPendingStellarPayouts();

    expect(prisma.payout.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          confirmationPollCount: 3,
          lastConfirmationCheckAt: expect.any(Date),
        }),
      }),
    );
    expect(prisma.payout.updateMany.mock.calls[0][0].data).not.toHaveProperty(
      'retryCount',
    );
  });

  it('marks not-found payouts failed after the configured poll limit', async () => {
    prisma.payout.findMany.mockResolvedValue([
      {
        id: 6,
        onChainTxHash: 'missing-tx',
        confirmationPollCount: STELLAR_CONFIRMATION_MAX_POLLS - 1,
        userId: 42,
        amount: 25,
      },
    ]);
    verification.verifyPayoutTransaction.mockResolvedValue({
      outcome: 'unknown',
      found: false,
    });
    prisma.payout.updateMany.mockResolvedValue({ count: 1 });

    await service.pollPendingStellarPayouts();

    expect(prisma.payout.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'failed',
          confirmationPollCount: STELLAR_CONFIRMATION_MAX_POLLS,
        }),
      }),
    );
  });

  it('does not count Horizon outages as a missing transaction', async () => {
    prisma.payout.findMany.mockResolvedValue([
      {
        id: 7,
        onChainTxHash: 'tx-hash',
        confirmationPollCount: 0,
        userId: 42,
        amount: 25,
      },
    ]);
    verification.verifyPayoutTransaction.mockResolvedValue({
      outcome: 'unavailable',
      found: false,
    });

    await service.pollPendingStellarPayouts();

    expect(prisma.payout.updateMany).not.toHaveBeenCalled();
  });

  it('stores the submitted hash and leaves a not-yet-indexed transaction processing', async () => {
    const platformKeypair = StellarSdk.Keypair.random();
    process.env.STELLAR_PLATFORM_SECRET = platformKeypair.secret();
    prisma.payout.findUnique.mockResolvedValue({
      id: 8,
      amount: 25,
      finalAmount: 24,
      currency: 'USD',
      method: 'stellar',
      status: 'approved',
      retryCount: 0,
      wallet: { address: 'GDEST' },
      user: { id: 42, email: 'creator@example.test' },
    });
    prisma.payout.update.mockResolvedValue({});
    verification.verifyPayoutTransaction.mockResolvedValue({
      outcome: 'unknown',
      found: false,
    });

    jest
      .spyOn(StellarSdk.Horizon.Server.prototype, 'loadAccount')
      .mockResolvedValue({
        sequenceNumber: () => '1',
        accountId: () => platformKeypair.publicKey(),
      } as never);
    jest.spyOn(StellarSdk.Keypair, 'fromSecret').mockReturnValue({
      publicKey: () => platformKeypair.publicKey(),
      sign: () => Buffer.from([]),
    } as never);
    jest.spyOn(StellarSdk.Operation, 'payment').mockReturnValue({} as never);
    jest
      .spyOn(StellarSdk.TransactionBuilder.prototype, 'addOperation')
      .mockImplementation(function () {
        return this;
      });
    jest
      .spyOn(StellarSdk.TransactionBuilder.prototype, 'setTimeout')
      .mockImplementation(function () {
        return this;
      });
    jest
      .spyOn(StellarSdk.TransactionBuilder.prototype, 'build')
      .mockReturnValue({
        sign: jest.fn(),
        hash: () => Buffer.from('internal-hash', 'utf8'),
      } as never);
    jest
      .spyOn(StellarSdk.Horizon.Server.prototype, 'submitTransaction')
      .mockResolvedValue({ hash: 'stellar-tx-hash' } as never);

    const result = await service.processPayout(8);

    expect(result.status).toBe('processing');
    expect(result.onChainTxHash).toBe('stellar-tx-hash');
    expect(prisma.payout.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 8 },
        data: expect.objectContaining({
          status: 'processing',
          onChainTxHash: 'stellar-tx-hash',
          externalTransactionId: 'stellar-tx-hash',
        }),
      }),
    );
    expect(retryQueue.add).not.toHaveBeenCalled();

    delete process.env.STELLAR_PLATFORM_SECRET;
    jest.restoreAllMocks();
  });
});
