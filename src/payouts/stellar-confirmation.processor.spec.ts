import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { StellarConfirmationProcessor } from './stellar-confirmation.processor';
import { PayoutsService } from './payouts.service';
import { PrismaService } from '../prisma/prisma.service';
import { StellarService } from '../stellar/stellar.service';
import { CircuitBreakerService } from '../common/circuit-breaker/circuit-breaker.service';
import {
  STELLAR_CONFIRMATION_QUEUE,
  STELLAR_CONFIRMATION_JOB,
  STELLAR_CONFIRMATION_INTERVAL_MS,
  STELLAR_CONFIRMATION_MAX_POLLS,
} from './stellar-confirmation.queue';
import { PAYOUT_RETRY_QUEUE } from './payout-retry.queue';
import { EarningsService } from '../earnings/earnings.service';
import { ConfigService } from '../config/config.service';
import { PayoutReceiptService } from './payout-receipt.service';
import { FeeService } from './fee.service';
import { PayoutApprovalService } from './payout-approval.service';

const TX_HASH = 'abc123deadbeef';
const CONFIRMED_AT = new Date('2025-01-15T10:00:00.000Z');

const mockPrismaService = {
  payout: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    create: jest.fn(),
    aggregate: jest.fn(),
  },
  wallet: { findFirst: jest.fn() },
  user: { findUnique: jest.fn() },
  earning: { aggregate: jest.fn() },
  earningsAuditLog: { create: jest.fn() },
  $transaction: jest.fn(),
};

const mockStellarService = {
  horizonUrl: 'https://horizon-testnet.stellar.org',
  networkPassphrase: 'Test SDF Network ; September 2015',
  getTransactionStatus: jest.fn(),
  getAccountBalance: jest.fn(),
  validateAddress: jest.fn().mockReturnValue({ valid: true }),
};

const mockQueue = {
  add: jest.fn().mockResolvedValue(undefined),
};

const mockPayoutRetryQueue = { add: jest.fn() };

function buildModule(overrides: Record<string, unknown> = {}): Promise<TestingModule> {
  return Test.createTestingModule({
    providers: [
      StellarConfirmationProcessor,
      PayoutsService,
      { provide: PrismaService, useValue: mockPrismaService },
      { provide: StellarService, useValue: mockStellarService },
      { provide: CircuitBreakerService, useValue: { execute: jest.fn() } },
      {
        provide: PayoutReceiptService,
        useValue: { generateAndSendReceipt: jest.fn() },
      },
      {
        provide: FeeService,
        useValue: { calculateFee: jest.fn() },
      },
      {
        provide: PayoutApprovalService,
        useValue: { resolveInitialStatus: jest.fn(), requiresManualApproval: jest.fn() },
      },
      {
        provide: EarningsService,
        useValue: {},
      },
      {
        provide: ConfigService,
        useValue: { minStellarPayout: 5 },
      },
      { provide: getQueueToken(STELLAR_CONFIRMATION_QUEUE), useValue: mockQueue },
      { provide: getQueueToken(PAYOUT_RETRY_QUEUE), useValue: mockPayoutRetryQueue },
      ...Object.entries(overrides).map(([token, useValue]) => ({ provide: token, useValue })),
    ],
  }).compile();
}

describe('StellarConfirmationProcessor', () => {
  let processor: StellarConfirmationProcessor;
  let payoutsService: PayoutsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrismaService.$transaction.mockImplementation(
      async (fn: (tx: typeof mockPrismaService) => Promise<unknown>) => fn(mockPrismaService),
    );

    const module = await buildModule();
    processor = module.get<StellarConfirmationProcessor>(StellarConfirmationProcessor);
    payoutsService = module.get<PayoutsService>(PayoutsService);
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
  });

  describe('onModuleInit', () => {
    it('should schedule a repeatable confirmation poll job', async () => {
      await processor.onModuleInit();

      expect(mockQueue.add).toHaveBeenCalledWith(
        STELLAR_CONFIRMATION_JOB,
        {},
        expect.objectContaining({
          repeat: { every: STELLAR_CONFIRMATION_INTERVAL_MS },
          jobId: `${STELLAR_CONFIRMATION_JOB}-recurring`,
        }),
      );
    });
  });

  describe('process', () => {
    it('should delegate to pollPendingStellarPayouts', async () => {
      const spy = jest.spyOn(payoutsService, 'pollPendingStellarPayouts').mockResolvedValue();
      await processor.process({ id: 'job-1' } as any);
      expect(spy).toHaveBeenCalledTimes(1);
    });
  });
});

describe('PayoutsService.pollPendingStellarPayouts', () => {
  let service: PayoutsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrismaService.$transaction.mockImplementation(
      async (fn: (tx: typeof mockPrismaService) => Promise<unknown>) => fn(mockPrismaService),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PayoutsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: StellarService, useValue: mockStellarService },
        { provide: CircuitBreakerService, useValue: { execute: jest.fn() } },
        {
          provide: PayoutReceiptService,
          useValue: { generateAndSendReceipt: jest.fn() },
        },
        {
          provide: FeeService,
          useValue: { calculateFee: jest.fn() },
        },
        {
          provide: PayoutApprovalService,
          useValue: { resolveInitialStatus: jest.fn(), requiresManualApproval: jest.fn() },
        },
        { provide: EarningsService, useValue: {} },
        { provide: ConfigService, useValue: { minStellarPayout: 5 } },
        { provide: getQueueToken(PAYOUT_RETRY_QUEUE), useValue: mockPayoutRetryQueue },
      ],
    }).compile();

    service = module.get<PayoutsService>(PayoutsService);
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  it('should do nothing when no pending Stellar payouts exist', async () => {
    mockPrismaService.payout.findMany.mockResolvedValue([]);

    await service.pollPendingStellarPayouts();

    expect(mockPrismaService.payout.updateMany).not.toHaveBeenCalled();
    expect(mockPrismaService.payout.update).not.toHaveBeenCalled();
  });

  it('should query only stellar payouts in pending/processing status with a tx hash and no confirmedAt', async () => {
    mockPrismaService.payout.findMany.mockResolvedValue([]);

    await service.pollPendingStellarPayouts();

    expect(mockPrismaService.payout.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          method: 'stellar',
          status: { in: ['pending', 'processing'] },
          onChainTxHash: { not: null },
          confirmedAt: null,
        },
      }),
    );
  });

  describe('successful on-chain confirmation', () => {
    it('should mark payout as completed with confirmedAt from Horizon', async () => {
      mockPrismaService.payout.findMany.mockResolvedValue([
        { id: 1, onChainTxHash: TX_HASH, retryCount: 0, userId: 10, amount: 25 },
      ]);
      mockStellarService.getTransactionStatus.mockResolvedValue({
        found: true,
        successful: true,
        confirmedAt: CONFIRMED_AT,
      });
      mockPrismaService.payout.updateMany.mockResolvedValue({ count: 1 });
      mockPrismaService.earningsAuditLog.create.mockResolvedValue({ id: 1 });

      await service.pollPendingStellarPayouts();

      expect(mockPrismaService.payout.updateMany).toHaveBeenCalledWith({
        where: {
          id: 1,
          status: { in: ['pending', 'processing'] },
          confirmedAt: null,
        },
        data: {
          status: 'completed',
          confirmedAt: CONFIRMED_AT,
        },
      });

      expect(mockPrismaService.earningsAuditLog.create).toHaveBeenCalledWith({
        data: {
          userId: 10,
          amount: 25,
          actionType: 'payout_verification_success',
        },
      });
    });

    it('should persist confirmedAt timestamp exactly as returned by Horizon', async () => {
      const horizonTimestamp = new Date('2025-03-10T08:30:00.000Z');
      mockPrismaService.payout.findMany.mockResolvedValue([
        { id: 2, onChainTxHash: TX_HASH, retryCount: 0 },
      ]);
      mockStellarService.getTransactionStatus.mockResolvedValue({
        found: true,
        successful: true,
        confirmedAt: horizonTimestamp,
      });
      mockPrismaService.payout.updateMany.mockResolvedValue({ count: 1 });

      await service.pollPendingStellarPayouts();

      const call = mockPrismaService.payout.updateMany.mock.calls[0][0];
      expect(call.data.confirmedAt).toBe(horizonTimestamp);
    });

    it('should fall back to current time when Horizon does not return confirmedAt', async () => {
      const before = new Date();
      mockPrismaService.payout.findMany.mockResolvedValue([
        { id: 3, onChainTxHash: TX_HASH, retryCount: 0 },
      ]);
      mockStellarService.getTransactionStatus.mockResolvedValue({
        found: true,
        successful: true,
        confirmedAt: undefined,
      });
      mockPrismaService.payout.updateMany.mockResolvedValue({ count: 1 });

      await service.pollPendingStellarPayouts();

      const call = mockPrismaService.payout.updateMany.mock.calls[0][0];
      const after = new Date();
      expect(call.data.confirmedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(call.data.confirmedAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  describe('failed on-chain transaction', () => {
    it('should mark payout as failed when transaction is rejected on-chain', async () => {
      mockPrismaService.payout.findMany.mockResolvedValue([
        { id: 4, onChainTxHash: TX_HASH, retryCount: 0, userId: 10, amount: 25 },
      ]);
      mockStellarService.getTransactionStatus.mockResolvedValue({
        found: true,
        successful: false,
      });
      mockPrismaService.payout.updateMany.mockResolvedValue({ count: 1 });
      mockPrismaService.earningsAuditLog.create.mockResolvedValue({ id: 1 });

      await service.pollPendingStellarPayouts();

      expect(mockPrismaService.payout.updateMany).toHaveBeenCalledWith({
        where: { id: 4, status: { in: ['pending', 'processing'] } },
        data: { status: 'failed' },
      });

      expect(mockPrismaService.earningsAuditLog.create).toHaveBeenCalledWith({
        data: {
          userId: 10,
          amount: 25,
          actionType: 'payout_verification_failed',
        },
      });
    });

    it('should not set confirmedAt when transaction fails on-chain', async () => {
      mockPrismaService.payout.findMany.mockResolvedValue([
        { id: 5, onChainTxHash: TX_HASH, retryCount: 0 },
      ]);
      mockStellarService.getTransactionStatus.mockResolvedValue({
        found: true,
        successful: false,
      });
      mockPrismaService.payout.updateMany.mockResolvedValue({ count: 1 });

      await service.pollPendingStellarPayouts();

      const call = mockPrismaService.payout.updateMany.mock.calls[0][0];
      expect(call.data).not.toHaveProperty('confirmedAt');
    });
  });

  describe('retry behavior (transaction not yet found)', () => {
    it('should increment retryCount when transaction is not yet on Horizon', async () => {
      mockPrismaService.payout.findMany.mockResolvedValue([
        { id: 6, onChainTxHash: TX_HASH, retryCount: 2 },
      ]);
      mockStellarService.getTransactionStatus.mockResolvedValue({ found: false });
      mockPrismaService.payout.update.mockResolvedValue({ id: 6 });

      await service.pollPendingStellarPayouts();

      expect(mockPrismaService.payout.update).toHaveBeenCalledWith({
        where: { id: 6 },
        data: { retryCount: 3, lastAttemptAt: expect.any(Date) },
      });
    });

    it('should mark payout failed after max polls are exhausted', async () => {
      mockPrismaService.payout.findMany.mockResolvedValue([
        { id: 7, onChainTxHash: TX_HASH, retryCount: STELLAR_CONFIRMATION_MAX_POLLS - 1 },
      ]);
      mockStellarService.getTransactionStatus.mockResolvedValue({ found: false });
      mockPrismaService.payout.updateMany.mockResolvedValue({ count: 1 });

      await service.pollPendingStellarPayouts();

      expect(mockPrismaService.payout.updateMany).toHaveBeenCalledWith({
        where: { id: 7, status: { in: ['pending', 'processing'] } },
        data: { status: 'failed', retryCount: STELLAR_CONFIRMATION_MAX_POLLS },
      });
    });

    it('should not mark failed when one poll below the max threshold', async () => {
      mockPrismaService.payout.findMany.mockResolvedValue([
        { id: 8, onChainTxHash: TX_HASH, retryCount: STELLAR_CONFIRMATION_MAX_POLLS - 2 },
      ]);
      mockStellarService.getTransactionStatus.mockResolvedValue({ found: false });
      mockPrismaService.payout.update.mockResolvedValue({ id: 8 });

      await service.pollPendingStellarPayouts();

      expect(mockPrismaService.payout.updateMany).not.toHaveBeenCalled();
      expect(mockPrismaService.payout.update).toHaveBeenCalled();
    });
  });

  describe('idempotency', () => {
    it('should use updateMany with status filter to prevent double-completion', async () => {
      mockPrismaService.payout.findMany.mockResolvedValue([
        { id: 9, onChainTxHash: TX_HASH, retryCount: 0 },
      ]);
      mockStellarService.getTransactionStatus.mockResolvedValue({
        found: true,
        successful: true,
        confirmedAt: CONFIRMED_AT,
      });
      mockPrismaService.payout.updateMany.mockResolvedValue({ count: 0 }); // already updated

      await expect(service.pollPendingStellarPayouts()).resolves.not.toThrow();
      expect(mockPrismaService.payout.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ confirmedAt: null }),
        }),
      );
    });

    it('should use updateMany with status filter to prevent double-failure', async () => {
      mockPrismaService.payout.findMany.mockResolvedValue([
        { id: 10, onChainTxHash: TX_HASH, retryCount: 0 },
      ]);
      mockStellarService.getTransactionStatus.mockResolvedValue({
        found: true,
        successful: false,
      });
      mockPrismaService.payout.updateMany.mockResolvedValue({ count: 0 }); // already updated

      await expect(service.pollPendingStellarPayouts()).resolves.not.toThrow();
      expect(mockPrismaService.payout.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: { in: ['pending', 'processing'] } }),
        }),
      );
    });
  });

  describe('error isolation', () => {
    it('should continue processing remaining payouts when one throws a transient error', async () => {
      mockPrismaService.payout.findMany.mockResolvedValue([
        { id: 11, onChainTxHash: 'hash-fails', retryCount: 0 },
        { id: 12, onChainTxHash: 'hash-ok', retryCount: 0 },
      ]);
      mockStellarService.getTransactionStatus
        .mockRejectedValueOnce(new Error('Horizon connection timeout'))
        .mockResolvedValueOnce({ found: true, successful: true, confirmedAt: CONFIRMED_AT });
      mockPrismaService.payout.updateMany.mockResolvedValue({ count: 1 });

      await expect(service.pollPendingStellarPayouts()).resolves.not.toThrow();

      expect(mockPrismaService.payout.updateMany).toHaveBeenCalledTimes(1);
      expect(mockPrismaService.payout.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ id: 12 }) }),
      );
    });

    it('should not throw when all payouts encounter transient errors', async () => {
      mockPrismaService.payout.findMany.mockResolvedValue([
        { id: 13, onChainTxHash: TX_HASH, retryCount: 0 },
      ]);
      mockStellarService.getTransactionStatus.mockRejectedValue(
        new Error('Circuit breaker open'),
      );

      await expect(service.pollPendingStellarPayouts()).resolves.not.toThrow();
      expect(mockPrismaService.payout.updateMany).not.toHaveBeenCalled();
    });
  });
});
