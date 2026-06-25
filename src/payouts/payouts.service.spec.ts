jest.mock('../stellar/stellar.service', () => ({
  StellarService: jest.fn().mockImplementation(() => ({
    horizonUrl: 'https://horizon-testnet.stellar.org',
    networkPassphrase: 'Test SDF Network ; September 2015',
  })),
}));

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
    $transaction: jest.fn(),
  };

  const mockStellarService = {
    horizonUrl: 'https://horizon-testnet.stellar.org',
    networkPassphrase: 'Test SDF Network ; September 2015',
    getAccountBalance: jest.fn(),
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
  });

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
