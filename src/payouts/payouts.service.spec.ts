
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
import {
  ConflictException,
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import * as StellarSdk from '@stellar/stellar-sdk';

describe('PayoutsService', () => {
  let service: PayoutsService;

  const mockPrismaService = {
    payout: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      aggregate: jest.fn(),
    },
    wallet: {
      findFirst: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
    earning: {
      aggregate: jest.fn(),
    },
    earningsAuditLog: {
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const mockStellarService = {
    horizonUrl: 'https://horizon-testnet.stellar.org',
    networkPassphrase: 'Test SDF Network ; September 2015',
    getAccountBalance: jest.fn(),
    getTransactionStatus: jest.fn(),
    validateAddress: jest.fn().mockReturnValue({ valid: true }),
  };

  const mockPayoutReceiptService = {
    generateAndSendReceipt: jest.fn().mockResolvedValue(undefined),
  };

  const mockEarningsService = {} as any;

  const mockFeeService = {
    calculateFee: jest.fn().mockResolvedValue({
      feeAmount: 0,
      feePercentage: 0,
      finalAmount: 100,
    }),
  };

  const mockPayoutApprovalService = {
    resolveInitialStatus: jest.fn((amount: number) =>
      amount >= 500 ? 'pending_approval' : 'approved',
    ),
    requiresManualApproval: jest.fn((amount: number) => amount >= 500),
    getApprovalThreshold: jest.fn(() => 500),
  };

  const mockPayoutRetryQueue = {
    add: jest.fn(),
  };

  const mockConfigService = { minStellarPayout: 5 };

  const mockPlatformAddress = StellarSdk.Keypair.random().publicKey();

  beforeEach(async () => {
    mockPrismaService.$transaction.mockImplementation(
      async (fn: (tx: typeof mockPrismaService) => Promise<unknown>) =>
        fn(mockPrismaService),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PayoutsService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: StellarService,
          useValue: mockStellarService,
        },
        {
          provide: PayoutReceiptService,
          useValue: mockPayoutReceiptService,
        },
        {
          provide: EarningsService,
          useValue: mockEarningsService,
        },
        {
          provide: FeeService,
          useValue: mockFeeService,
        },
        {
          provide: PayoutApprovalService,
          useValue: mockPayoutApprovalService,
        },
        {
          provide: getQueueToken(PAYOUT_RETRY_QUEUE),
          useValue: mockPayoutRetryQueue,
        },
        {
          provide: EarningsService,
          useValue: {
            processCreatorEarnings: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<PayoutsService>(PayoutsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    delete process.env.STELLAR_PLATFORM_SECRET;
    delete process.env.STELLAR_WALLET_ADDRESS;
    delete process.env.PLATFORM_WALLET_ADDRESS;
    jest.restoreAllMocks();
    mockConfigService.minStellarPayout = 5;
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('requestPayout', () => {
    it('should throw ConflictException if pending payout exists', async () => {
      mockPrismaService.payout.findFirst.mockResolvedValue({
        id: 1,
        status: 'pending',
      });

      await expect(service.requestPayout(1)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should throw BadRequestException if no wallet found', async () => {
      mockPrismaService.payout.findFirst.mockResolvedValue(null);
      mockPrismaService.wallet.findFirst.mockResolvedValue(null);

      await expect(service.requestPayout(1)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should create payout with available balance after fees', async () => {
      mockConfigService.minStellarPayout = 1;
      mockPrismaService.payout.findFirst.mockResolvedValue(null);
      mockPrismaService.wallet.findFirst.mockResolvedValue({
        id: 1,
        address: 'GTEST...',
      });
      mockPrismaService.earning.aggregate.mockResolvedValue({
        _sum: { amount: 3 },
      });
      mockPrismaService.payout.aggregate.mockResolvedValue({
        _sum: { amount: 0 },
      });
      mockFeeService.calculateFee.mockResolvedValue({
        feeAmount: 0,
        feePercentage: 0,
        finalAmount: 3,
      });
      mockPrismaService.payout.create.mockResolvedValue({
        id: 9,
        amount: 3,
        status: 'approved',
        createdAt: new Date(),
        feeAmount: 0,
        finalAmount: 3,
      });

      const result = await service.requestPayout(1);

      expect(mockFeeService.calculateFee).toHaveBeenCalledWith(3, 'stellar');
      expect(mockPrismaService.payout.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            amount: 3,
            currency: 'USD',
            status: 'approved',
          }),
        }),
      );
      expect(result.amount).toBe(3);
    });

    it('should create payout for full available balance', async () => {
      mockPrismaService.payout.findFirst.mockResolvedValue(null);
      mockPrismaService.wallet.findFirst.mockResolvedValue({
        id: 1,
        address: 'GTEST...',
      });
      mockPrismaService.earning.aggregate.mockResolvedValue({
        _sum: { amount: 20000 },
      });
      mockPrismaService.payout.aggregate.mockResolvedValue({
        _sum: { amount: 0 },
      });
      mockFeeService.calculateFee.mockResolvedValue({
        feeAmount: 100,
        feePercentage: 0.5,
        finalAmount: 19900,
      });
      mockPrismaService.payout.create.mockResolvedValue({
        id: 9,
        amount: 20000,
        status: 'pending_approval',
        createdAt: new Date(),
        feeAmount: 100,
        finalAmount: 19900,
      });

      const result = await service.requestPayout(1);

      expect(mockFeeService.calculateFee).toHaveBeenCalledWith(20000, 'stellar');
      expect(mockPrismaService.payout.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            amount: 20000,
            currency: 'USD',
            status: 'pending_approval',
          }),
        }),
      );
      expect(result.amount).toBe(20000);
    });
  });

  describe('getPayouts', () => {
    it('should return all payouts for user', async () => {
      const payouts = [
        { id: 1, amount: 100, status: 'completed' },
        { id: 2, amount: 50, status: 'pending' },
      ];
      mockPrismaService.payout.findMany.mockResolvedValue(payouts);

      const result = await service.getPayouts(1);
      expect(result).toHaveLength(2);
      expect(mockPrismaService.payout.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 1 },
        }),
      );
    });

    it('should filter payouts by status', async () => {
      mockPrismaService.payout.findMany.mockResolvedValue([]);

      await service.getPayouts(1, 'pending');

      expect(mockPrismaService.payout.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 1, status: 'pending' },
        }),
      );
    });

    it('should pass through unknown status values to the query', async () => {
      mockPrismaService.payout.findMany.mockResolvedValue([]);

      await service.getPayouts(1, 'processing');

      expect(mockPrismaService.payout.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 1, status: 'processing' },
        }),
      );
    });
  });

  describe('getPayoutById', () => {
    it('should return payout when owned by user', async () => {
      const payout = { id: 5, userId: 1, amount: 100, status: 'completed' };
      mockPrismaService.payout.findFirst.mockResolvedValue(payout);

      const result = await service.getPayoutById(1, 5);
      expect(result).toEqual(payout);
      expect(mockPrismaService.payout.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 5, userId: 1 },
        }),
      );
    });

    it('should throw NotFoundException when payout does not exist', async () => {
      mockPrismaService.payout.findFirst.mockResolvedValue(null);

      await expect(service.getPayoutById(1, 999)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException when payout belongs to another user', async () => {
      mockPrismaService.payout.findFirst.mockResolvedValue(null);

      await expect(service.getPayoutById(2, 5)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('processPayout', () => {
    it('should throw NotFoundException if payout not found', async () => {
      mockPrismaService.payout.findUnique.mockResolvedValue(null);

      await expect(service.processPayout(999)).rejects.toThrow();
    });

    it('should throw InternalServerErrorException if STELLAR_PLATFORM_SECRET not set', async () => {
      mockPrismaService.payout.findUnique.mockResolvedValue({
        id: 1,
        status: 'approved',
        wallet: { address: 'GTEST...' },
      });

      await expect(service.processPayout(1)).rejects.toThrow(
        InternalServerErrorException,
      );
    });

    it('should successfully verify and complete payout, logging payout_verification_success', async () => {
      process.env.STELLAR_PLATFORM_SECRET = 'SXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';
      const destination = StellarSdk.Keypair.random().publicKey();

      const payout = {
        id: 101,
        amount: 100,
        currency: 'USD',
        method: 'stellar',
        status: 'approved',
        wallet: { address: destination },
        user: { id: 1, email: 'user@example.com' },
        retryCount: 0,
      };

      mockPrismaService.payout.findUnique.mockResolvedValue(payout);
      mockPrismaService.payout.update.mockResolvedValue({ id: 101, status: 'completed' });
      mockPrismaService.earningsAuditLog.create = jest.fn().mockResolvedValue({ id: 1 });

      jest.spyOn(StellarSdk.Horizon.Server.prototype, 'loadAccount').mockResolvedValue({
        sequenceNumber: () => '1',
        accountId: () => mockPlatformAddress,
      } as any);
      jest.spyOn(StellarSdk.Keypair, 'fromSecret').mockReturnValue({
        publicKey: () => mockPlatformAddress,
        sign: () => Buffer.from([]),
      } as any);
      jest.spyOn(StellarSdk.Operation, 'payment').mockImplementation(() => ({} as any));
      jest.spyOn(StellarSdk.TransactionBuilder.prototype, 'addOperation').mockImplementation(function () {
        return this;
      });
      jest.spyOn(StellarSdk.TransactionBuilder.prototype, 'setTimeout').mockImplementation(function () {
        return this;
      });
      jest.spyOn(StellarSdk.TransactionBuilder.prototype, 'build').mockImplementation(function () {
        return {
          sign: () => {},
          hash: () => Buffer.from('abc123deadbeef', 'hex'),
        } as any;
      });
      jest.spyOn(StellarSdk.Horizon.Server.prototype, 'submitTransaction').mockResolvedValue({
        hash: 'abc123deadbeef',
      } as any);
      mockStellarService.getTransactionStatus.mockResolvedValue({
        found: true,
        successful: true,
        confirmedAt: new Date('2026-06-29T12:00:00.000Z'),
      });

      const result = await service.processPayout(101);

      expect(result.status).toBe('completed');
      expect(result.externalTransactionId).toBe('abc123deadbeef');

      expect(mockPrismaService.earningsAuditLog.create).toHaveBeenCalledWith({
        data: {
          userId: 1,
          amount: 100,
          actionType: 'payout_verification_success',
        },
      });

      delete process.env.STELLAR_PLATFORM_SECRET;
    });

    it('should fail if transaction verification fails, logging payout_verification_failed and throwing error', async () => {
      process.env.STELLAR_PLATFORM_SECRET = 'SXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';
      const destination = StellarSdk.Keypair.random().publicKey();

      const payout = {
        id: 102,
        amount: 100,
        currency: 'USD',
        method: 'stellar',
        status: 'approved',
        wallet: { address: destination },
        user: { id: 1, email: 'user@example.com' },
        retryCount: 0,
      };

      mockPrismaService.payout.findUnique.mockResolvedValue(payout);
      mockPrismaService.payout.update.mockResolvedValue({ id: 102, status: 'failed' });
      mockPrismaService.earningsAuditLog.create = jest.fn().mockResolvedValue({ id: 2 });

      jest.spyOn(StellarSdk.Horizon.Server.prototype, 'loadAccount').mockResolvedValue({
        sequenceNumber: () => '1',
        accountId: () => mockPlatformAddress,
      } as any);
      jest.spyOn(StellarSdk.Keypair, 'fromSecret').mockReturnValue({
        publicKey: () => mockPlatformAddress,
        sign: () => Buffer.from([]),
      } as any);
      jest.spyOn(StellarSdk.Operation, 'payment').mockImplementation(() => ({} as any));
      jest.spyOn(StellarSdk.TransactionBuilder.prototype, 'addOperation').mockImplementation(function () {
        return this;
      });
      jest.spyOn(StellarSdk.TransactionBuilder.prototype, 'setTimeout').mockImplementation(function () {
        return this;
      });
      jest.spyOn(StellarSdk.TransactionBuilder.prototype, 'build').mockImplementation(function () {
        return {
          sign: () => {},
          hash: () => Buffer.from('abc123deadbeef', 'hex'),
        } as any;
      });
      jest.spyOn(StellarSdk.Horizon.Server.prototype, 'submitTransaction').mockResolvedValue({
        hash: 'abc123deadbeef',
      } as any);
      mockStellarService.getTransactionStatus.mockResolvedValue({
        found: true,
        successful: false,
      });

      await expect(service.processPayout(102)).rejects.toThrow();

      expect(mockPrismaService.earningsAuditLog.create).toHaveBeenCalledWith({
        data: {
          userId: 1,
          amount: 100,
          actionType: 'payout_verification_failed',
        },
      });

      delete process.env.STELLAR_PLATFORM_SECRET;
    });
  });

  // ─── Minimum Payout Enforcement ─────────────────────────────────────────────

  describe('minimum payout enforcement', () => {
    const MIN = 5;

    describe('requestPayoutWithDetails', () => {
      const setupConflictFree = () => {
        mockPrismaService.payout.findFirst.mockResolvedValue(null);
      };

      it('throws BadRequestException when amount is below the configured minimum', async () => {
        setupConflictFree();
        await expect(
          service.requestPayoutWithDetails(1, MIN - 0.01, 'USD', 'stellar'),
        ).rejects.toThrow(BadRequestException);
      });

      it('error message reflects the configured threshold, not a hardcoded value', async () => {
        setupConflictFree();
        mockConfigService.minStellarPayout = 10;
        await expect(
          service.requestPayoutWithDetails(1, 4, 'USD', 'stellar'),
        ).rejects.toThrow('Minimum payout amount is 10 USD equivalent.');
      });

      it('does not query the database for balance when amount is below threshold', async () => {
        setupConflictFree();
        await expect(
          service.requestPayoutWithDetails(1, MIN - 1, 'USD', 'stellar'),
        ).rejects.toThrow(BadRequestException);
        expect(mockPrismaService.earning.aggregate).not.toHaveBeenCalled();
        expect(mockPrismaService.payout.create).not.toHaveBeenCalled();
      });

      it('proceeds when amount exactly equals the configured minimum', async () => {
        setupConflictFree();
        mockPrismaService.earning.aggregate.mockResolvedValue({ _sum: { amount: 100 } });
        mockPrismaService.payout.aggregate.mockResolvedValue({ _sum: { amount: 0 } });
        mockPrismaService.wallet.findFirst.mockResolvedValue({ id: 1, address: 'GTEST...' });
        mockPrismaService.payout.create.mockResolvedValue({
          id: 1,
          amount: MIN,
          currency: 'USD',
          method: 'stellar',
          status: 'approved',
          createdAt: new Date(),
          feeAmount: 0,
          finalAmount: MIN,
        });

        const result = await service.requestPayoutWithDetails(1, MIN, 'USD', 'stellar');
        expect(result.amount).toBe(MIN);
      });

      it('proceeds when amount exceeds the configured minimum', async () => {
        setupConflictFree();
        const amount = MIN + 100;
        mockPrismaService.earning.aggregate.mockResolvedValue({ _sum: { amount: 1000 } });
        mockPrismaService.payout.aggregate.mockResolvedValue({ _sum: { amount: 0 } });
        mockPrismaService.wallet.findFirst.mockResolvedValue({ id: 1, address: 'GTEST...' });
        mockPrismaService.payout.create.mockResolvedValue({
          id: 2,
          amount,
          currency: 'USD',
          method: 'stellar',
          status: 'approved',
          createdAt: new Date(),
          feeAmount: 0,
          finalAmount: amount,
        });

        const result = await service.requestPayoutWithDetails(1, amount, 'USD', 'stellar');
        expect(result.amount).toBe(amount);
      });
    });

    describe('requestPayout', () => {
      it('throws BadRequestException when available balance is below the minimum', async () => {
        mockPrismaService.payout.findFirst.mockResolvedValue(null);
        mockPrismaService.wallet.findFirst.mockResolvedValue({ id: 1, address: 'GTEST...' });
        mockPrismaService.earning.aggregate.mockResolvedValue({ _sum: { amount: MIN - 1 } });
        mockPrismaService.payout.aggregate.mockResolvedValue({ _sum: { amount: 0 } });

        await expect(service.requestPayout(1)).rejects.toThrow(BadRequestException);
        await expect(service.requestPayout(1)).rejects.toThrow('Minimum payout amount is 5 USD equivalent.');
      });

      it('does not create a payout when balance is below the minimum', async () => {
        mockPrismaService.payout.findFirst.mockResolvedValue(null);
        mockPrismaService.wallet.findFirst.mockResolvedValue({ id: 1, address: 'GTEST...' });
        mockPrismaService.earning.aggregate.mockResolvedValue({ _sum: { amount: MIN - 1 } });
        mockPrismaService.payout.aggregate.mockResolvedValue({ _sum: { amount: 0 } });

        await expect(service.requestPayout(1)).rejects.toThrow(BadRequestException);
        expect(mockPrismaService.payout.create).not.toHaveBeenCalled();
      });

      it('proceeds when available balance exactly equals the minimum', async () => {
        mockPrismaService.payout.findFirst.mockResolvedValue(null);
        mockPrismaService.wallet.findFirst.mockResolvedValue({ id: 1, address: 'GTEST...' });
        mockPrismaService.earning.aggregate.mockResolvedValue({ _sum: { amount: MIN } });
        mockPrismaService.payout.aggregate.mockResolvedValue({ _sum: { amount: 0 } });
        mockPrismaService.payout.create.mockResolvedValue({
          id: 3,
          amount: MIN,
          status: 'approved',
          createdAt: new Date(),
          feeAmount: 0,
          finalAmount: MIN,
        });

        const result = await service.requestPayout(1);
        expect(result.amount).toBe(MIN);
      });
    });

    describe('initiateStellarPayout', () => {
      const belowMinPayoutRecord = (amount: number) => ({
        id: 77,
        userId: 1,
        amount,
        currency: 'USD',
        method: 'stellar',
        status: 'approved',
        wallet: { address: StellarSdk.Keypair.random().publicKey() },
        transactionId: null,
      });

      beforeEach(() => {
        process.env.STELLAR_PLATFORM_SECRET = 'SOME_SECRET';
        process.env.STELLAR_WALLET_ADDRESS = mockPlatformAddress;
      });

      afterEach(() => {
        delete process.env.STELLAR_PLATFORM_SECRET;
        delete process.env.STELLAR_WALLET_ADDRESS;
      });

      it('throws BadRequestException when amount is below the configured minimum', async () => {
        const amount = MIN - 1;
        mockPrismaService.payout.findFirst.mockResolvedValue(
          belowMinPayoutRecord(amount),
        );

        await expect(
          service.initiateStellarPayout(1, 77, amount),
        ).rejects.toThrow(BadRequestException);
        await expect(
          service.initiateStellarPayout(1, 77, amount),
        ).rejects.toThrow('Minimum payout amount is 5 USD equivalent.');
      });

      it('does not query Stellar balance or build a transaction when amount is below minimum', async () => {
        const amount = MIN - 1;
        mockPrismaService.payout.findFirst.mockResolvedValue(
          belowMinPayoutRecord(amount),
        );

        await expect(
          service.initiateStellarPayout(1, 77, amount),
        ).rejects.toThrow(BadRequestException);
        expect(mockStellarService.getAccountBalance).not.toHaveBeenCalled();
        expect(mockPrismaService.payout.update).not.toHaveBeenCalled();
      });

      it('proceeds when amount exactly equals the configured minimum', async () => {
        const destination = StellarSdk.Keypair.random().publicKey();
        mockPrismaService.payout.findFirst
          .mockResolvedValueOnce({
            id: 78,
            userId: 1,
            amount: MIN,
            currency: 'USD',
            method: 'stellar',
            status: 'approved',
            wallet: { address: destination },
            transactionId: null,
          })
          .mockResolvedValueOnce(null);

        jest.spyOn(mockStellarService as any, 'getAccountBalance').mockResolvedValue(250);
        jest.spyOn(StellarSdk.Horizon.Server.prototype, 'loadAccount').mockResolvedValue({
          sequenceNumber: () => '1',
          accountId: () => mockPlatformAddress,
        } as any);
        jest.spyOn(StellarSdk.Keypair, 'fromSecret').mockReturnValue({
          publicKey: () => mockPlatformAddress,
          sign: () => Buffer.from([]),
        } as any);
        jest.spyOn(StellarSdk.Operation, 'payment').mockImplementation(() => ({} as any));
        jest.spyOn(StellarSdk.TransactionBuilder.prototype, 'addOperation').mockImplementation(function () { return this; });
        jest.spyOn(StellarSdk.TransactionBuilder.prototype, 'setTimeout').mockImplementation(function () { return this; });
        jest.spyOn(StellarSdk.TransactionBuilder.prototype, 'build').mockImplementation(function () {
          return {
            sign: () => {},
            hash: () => Buffer.from('aabbccdd', 'hex'),
            toXDR: () => 'mock-xdr-min',
          };
        });
        mockPrismaService.payout.update.mockResolvedValue({
          id: 78,
          amount: MIN,
          status: 'pending',
        });

        const result = await service.initiateStellarPayout(1, 78, MIN);
        expect(result.status).toBe('pending');
      });
    });

    describe('processPayout', () => {
      it('throws BadRequestException when payout amount is below the configured minimum', async () => {
        mockPrismaService.payout.findUnique.mockResolvedValue({
          id: 99,
          amount: MIN - 1,
          currency: 'USD',
          method: 'stellar',
          status: 'approved',
          retryCount: 0,
          stellarXdr: null,
          wallet: { address: StellarSdk.Keypair.random().publicKey() },
          user: { id: 1, email: 'user@example.com' },
        });

        await expect(service.processPayout(99)).rejects.toThrow(BadRequestException);
        await expect(service.processPayout(99)).rejects.toThrow('Minimum payout amount is 5 USD equivalent.');
      });

      it('does not build or submit a Stellar transaction when payout is below the minimum', async () => {
        mockPrismaService.payout.findUnique.mockResolvedValue({
          id: 99,
          amount: MIN - 1,
          currency: 'USD',
          method: 'stellar',
          status: 'approved',
          retryCount: 0,
          stellarXdr: null,
          wallet: { address: StellarSdk.Keypair.random().publicKey() },
          user: { id: 1, email: 'user@example.com' },
        });

        await expect(service.processPayout(99)).rejects.toThrow(BadRequestException);
        expect(mockPrismaService.payout.update).not.toHaveBeenCalled();
      });
    });

    describe('dynamic threshold', () => {
      it('uses the configured threshold rather than a hardcoded value', async () => {
        mockConfigService.minStellarPayout = 25;
        mockPrismaService.payout.findFirst.mockResolvedValue(null);

        await expect(
          service.requestPayoutWithDetails(1, 24, 'USD', 'stellar'),
        ).rejects.toThrow('Minimum payout amount is 25 USD equivalent.');
      });

      it('accepts amounts above a raised threshold', async () => {
        mockConfigService.minStellarPayout = 1;
        mockPrismaService.payout.findFirst.mockResolvedValue(null);
        mockPrismaService.earning.aggregate.mockResolvedValue({ _sum: { amount: 100 } });
        mockPrismaService.payout.aggregate.mockResolvedValue({ _sum: { amount: 0 } });
        mockPrismaService.wallet.findFirst.mockResolvedValue({ id: 1, address: 'GTEST...' });
        mockPrismaService.payout.create.mockResolvedValue({
          id: 10,
          amount: 2,
          currency: 'USD',
          method: 'stellar',
          status: 'approved',
          createdAt: new Date(),
          feeAmount: 0,
          finalAmount: 2,
        });

        const result = await service.requestPayoutWithDetails(1, 2, 'USD', 'stellar');
        expect(result.amount).toBe(2);
      });
    });
  });

  // ─── initiateStellarPayout (existing tests) ──────────────────────────────────

  describe('initiateStellarPayout', () => {
    beforeEach(() => {
      process.env.STELLAR_PLATFORM_SECRET = 'SOME_SECRET';
      process.env.STELLAR_WALLET_ADDRESS = mockPlatformAddress;
    });

    afterEach(() => {
      delete process.env.STELLAR_PLATFORM_SECRET;
      delete process.env.STELLAR_WALLET_ADDRESS;
    });

    it('should create a pending payout transaction and store XDR', async () => {
      const destination = StellarSdk.Keypair.random().publicKey();
      mockPrismaService.payout.findFirst
        .mockResolvedValueOnce({
          id: 44,
          userId: 1,
          amount: 100,
          currency: 'USD',
          method: 'stellar',
          status: 'approved',
          wallet: { address: destination },
          transactionId: null,
        })
        .mockResolvedValueOnce(null);
      mockPrismaService.wallet.findFirst.mockResolvedValue({ id: 1, address: destination });
      mockPrismaService.payout.update.mockResolvedValue({
        id: 44,
        amount: 100,
        status: 'pending',
      });
      jest.spyOn(mockStellarService as any, 'getAccountBalance').mockResolvedValue(250);

      jest.spyOn(StellarSdk.Horizon.Server.prototype, 'loadAccount').mockResolvedValue({
        sequenceNumber: () => '1',
        accountId: () => mockPlatformAddress,
      } as any);
      jest.spyOn(StellarSdk.Keypair, 'fromSecret').mockReturnValue({
        publicKey: () => mockPlatformAddress,
        sign: () => Buffer.from([]),
      } as any);
      jest.spyOn(StellarSdk.Operation, 'payment').mockImplementation(() => ({} as any));
      jest.spyOn(StellarSdk.TransactionBuilder.prototype, 'addOperation').mockImplementation(function () {
        return this;
      });
      jest.spyOn(StellarSdk.TransactionBuilder.prototype, 'setTimeout').mockImplementation(function () {
        return this;
      });
      jest.spyOn(StellarSdk.TransactionBuilder.prototype, 'build').mockImplementation(function () {
        return {
          sign: () => {},
          hash: () => Buffer.from('deadbeef', 'hex'),
          toXDR: () => 'mock-xdr',
        };
      });

      const result = await service.initiateStellarPayout(1, 44, 100);

      expect(result.status).toBe('pending');
      expect(result.stellarXdr).toBe('mock-xdr');
      expect(result.transactionId).toBe('deadbeef');
      expect(mockPrismaService.payout.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 44 },
          data: expect.objectContaining({
            status: 'pending',
            transactionId: 'deadbeef',
            stellarXdr: 'mock-xdr',
            externalTransactionId: 'deadbeef',
          }),
        }),
      );
    });

    it('should validate platform balance before building the transaction', async () => {
      mockPrismaService.payout.findFirst
        .mockResolvedValueOnce({
          id: 55,
          userId: 1,
          amount: 100,
          currency: 'USD',
          method: 'stellar',
          status: 'approved',
          wallet: { address: StellarSdk.Keypair.random().publicKey() },
          transactionId: null,
        })
        .mockResolvedValueOnce(null);
      jest.spyOn(mockStellarService as any, 'getAccountBalance').mockResolvedValue(50);

      await expect(
        service.initiateStellarPayout(1, 55, 100),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
