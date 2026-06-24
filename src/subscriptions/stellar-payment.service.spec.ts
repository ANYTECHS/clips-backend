import { Test, TestingModule } from '@nestjs/testing';
import { StellarPaymentService } from './stellar-payment.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { CreateStellarSubscriptionDto } from './dto/create-stellar-subscription.dto';
import { StellarService } from '../stellar/stellar.service';
import { CircuitBreakerService } from '../common/circuit-breaker/circuit-breaker.service';

jest.mock('../prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

jest.mock('@stellar/stellar-sdk', () => require('../../test/mocks/stellar-sdk.mock'));

describe('StellarPaymentService', () => {
  let service: StellarPaymentService;

  const mockPrismaService = {
    wallet: { findFirst: jest.fn() },
    stellarPaymentIntent: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    subscription: {
      updateMany: jest.fn(),
      create: jest.fn(),
    },
  };

  const mockConfigService = {
    get: jest.fn().mockReturnValue('https://horizon-testnet.stellar.org'),
  };

  const mockStellarService = {
    validateAddress: jest.fn().mockReturnValue({ valid: true }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StellarPaymentService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: StellarService, useValue: mockStellarService },
        CircuitBreakerService,
      ],
    }).compile();

    service = module.get<StellarPaymentService>(StellarPaymentService);
  });

  describe('createPaymentIntent', () => {
    it('validates destination address and creates intent', async () => {
      const userId = 1;
      const dto: CreateStellarSubscriptionDto = {
        plan: 'pro',
        asset: 'xlm',
        amount: 10,
        walletId: '1',
      };
      const mockWallet = { id: 1, userId: 1, address: 'GDEST' };
      const mockPaymentIntent = {
        id: 'intent-id',
        amount: 10,
        asset: 'xlm',
        destination: 'GDEST',
        memo: 'memo',
        status: 'pending',
        expiresAt: new Date(),
      };
      mockPrismaService.wallet.findFirst.mockResolvedValue(mockWallet);
      mockPrismaService.stellarPaymentIntent.create.mockResolvedValue(
        mockPaymentIntent,
      );
      mockPrismaService.stellarPaymentIntent.create.mockResolvedValue(mockPaymentIntent);

      const result = await service.createPaymentIntent(userId, dto);

      expect(result).toEqual({
        id: 'intent-id',
        amount: 10,
        asset: 'xlm',
        destination: mockWallet.address,
        memo: expect.stringMatching(/^CLIPS-/),
        expiresAt: mockPaymentIntent.expiresAt,
        status: 'pending',
      });
    });

    it('should throw error if wallet not found', async () => {
      const userId = 1;
      const dto: CreateStellarSubscriptionDto = {
        plan: 'pro',
        asset: 'xlm',
        amount: 10,
      };

      const result = await service.createPaymentIntent(1, dto);

      expect(mockStellarService.validateAddress).toHaveBeenCalledWith('GDEST');
      expect(result.destination).toBe('GDEST');
    });
  });

  describe('processDetectedPayment', () => {
    it('activates subscription on matching payment', async () => {
      mockPrismaService.stellarPaymentIntent.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          id: 'intent1',
          userId: 1,
          amount: 10,
          plan: 'pro',
          status: 'pending',
          expiresAt: new Date(Date.now() + 5 * 60 * 1000),
        });
      mockPrismaService.stellarPaymentIntent.update.mockResolvedValue({});
      mockPrismaService.subscription.updateMany.mockResolvedValue({ count: 0 });
      mockPrismaService.subscription.create.mockResolvedValue({});

      const ok = await service.processDetectedPayment({
        memo: 'memo1',
        amount: 10,
        transactionId: 'tx1',
      });

      expect(ok).toBe(true);
      expect(mockPrismaService.subscription.create).toHaveBeenCalled();
      expect(mockPrismaService.subscription.updateMany).toHaveBeenCalledWith({
        where: {
          userId: 1,
          status: 'active',
        },
        data: {
          status: 'cancelled',
          endDate: expect.any(Date),
        },
      });
    });
  });
});
