import { Test, TestingModule } from '@nestjs/testing';
import { StellarWebhookService } from './stellar-webhook.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException, BadRequestException } from '@nestjs/common';
import * as crypto from 'crypto';
import { StellarPaymentService } from './stellar-payment.service';
import { StellarService } from '../stellar/stellar.service';

jest.mock('@stellar/stellar-sdk', () => require('../../test/mocks/stellar-sdk.mock'));

describe('StellarWebhookService', () => {
  let service: StellarWebhookService;
  let prismaService: PrismaService;
  let configService: ConfigService;

  const mockPrismaService = {
    stellarPaymentIntent: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    subscription: {
      updateMany: jest.fn(),
      create: jest.fn(),
    },
    stellarWebhookLog: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
  };

  const configValues: Record<string, string> = {
    STELLAR_HORIZON_URL: 'https://horizon-testnet.stellar.org',
    WEBHOOK_SECRET: 'test_webhook_secret_32_chars_long!!',
    STELLAR_WALLET_ADDRESS: 'GAAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQDZ7H',
  };

  const mockConfigService = {
    get: jest.fn((key: string) => configValues[key]),
  };

  const mockStellarPaymentService = {
    processDetectedPayment: jest.fn().mockResolvedValue(true),
  };

  const mockStellarService = {
    horizonUrl: 'https://horizon-testnet.stellar.org',
    validateAddress: jest.fn().mockReturnValue({ valid: true }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockConfigService.get.mockImplementation((key: string) => configValues[key]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StellarWebhookService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: StellarPaymentService, useValue: mockStellarPaymentService },
        { provide: StellarService, useValue: mockStellarService },
      ],
    }).compile();

    service = module.get<StellarWebhookService>(StellarWebhookService);
    prismaService = module.get<PrismaService>(PrismaService);
    configService = module.get<ConfigService>(ConfigService);
  });

  describe('verifyWebhookSignature', () => {
    it('should return true for valid signature', () => {
      const payload = JSON.stringify({ test: 'data' });
      const secret = 'test_webhook_secret_32_chars_long!!';
      const validSignature = crypto
        .createHmac('sha256', secret)
        .update(payload)
        .digest('hex');

      const result = service.verifyWebhookSignature(payload, validSignature);
      expect(result).toBe(true);
    });

    it('should return false for invalid signature', () => {
      const payload = JSON.stringify({ test: 'data' });
      const invalidSignature = 'invalid_signature_hex';

      const result = service.verifyWebhookSignature(payload, invalidSignature);
      expect(result).toBe(false);
    });

    it('should return false for missing signature', () => {
      const payload = JSON.stringify({ test: 'data' });

      const result = service.verifyWebhookSignature(payload, '');
      expect(result).toBe(false);
    });

    it('should throw UnauthorizedException when WEBHOOK_SECRET is not configured', () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'WEBHOOK_SECRET') return undefined;
        return configValues[key];
      });

      const payload = JSON.stringify({ test: 'data' });
      const signature = 'any_signature';

      expect(() => {
        service.verifyWebhookSignature(payload, signature);
      }).toThrow(UnauthorizedException);
    });

    it('should use constant-time comparison to prevent timing attacks', () => {
      const payload = JSON.stringify({ test: 'data' });
      const secret = 'test_webhook_secret_32_chars_long!!';

      // Create a valid signature
      const validSignature = crypto
        .createHmac('sha256', secret)
        .update(payload)
        .digest('hex');

      // Create a signature that differs only slightly
      const slightlyDifferentSignature = validSignature.slice(0, -1) + '0';

      const start1 = process.hrtime.bigint();
      service.verifyWebhookSignature(payload, validSignature);
      const end1 = process.hrtime.bigint();

      const start2 = process.hrtime.bigint();
      service.verifyWebhookSignature(payload, slightlyDifferentSignature);
      const end2 = process.hrtime.bigint();

      // Both should take similar time (constant-time comparison)
      const time1 = Number(end1 - start1);
      const time2 = Number(end2 - start2);

      // Times should be within 10x of each other (not 100x faster for mismatches)
      const ratio = Math.max(time1, time2) / Math.min(time1, time2);
      expect(ratio).toBeLessThan(10);
    });
  });

  describe('isDuplicateWebhook', () => {
    it('should return true for duplicate transaction', async () => {
      mockPrismaService.stellarWebhookLog.findUnique.mockResolvedValue({
        id: 1,
        transactionId: 'tx123',
      });

      const result = await service.isDuplicateWebhook('tx123');
      expect(result).toBe(true);
      expect(mockPrismaService.stellarWebhookLog.findUnique).toHaveBeenCalledWith({
        where: { transactionId: 'tx123' },
      });
    });

    it('should return false for new transaction', async () => {
      mockPrismaService.stellarWebhookLog.findUnique.mockResolvedValue(null);

      const result = await service.isDuplicateWebhook('tx456');
      expect(result).toBe(false);
    });

    it('should return false on database error to avoid blocking valid payments', async () => {
      mockPrismaService.stellarWebhookLog.findUnique.mockRejectedValue(
        new Error('Database error'),
      );

      const result = await service.isDuplicateWebhook('tx789');
      expect(result).toBe(false);
    });
  });

  describe('logWebhookDelivery', () => {
    it('should log webhook delivery successfully', async () => {
      mockPrismaService.stellarWebhookLog.create.mockResolvedValue({ id: 1 });

      const payload = { transaction_hash: 'tx123', amount: 100 };
      await service.logWebhookDelivery('tx123', payload);

      expect(mockPrismaService.stellarWebhookLog.create).toHaveBeenCalledWith({
        data: {
          transactionId: 'tx123',
          payload: JSON.stringify(payload),
          processedAt: expect.any(Date),
        },
      });
    });

    it('should handle duplicate key error gracefully', async () => {
      // Prisma duplicate key error
      const duplicateError = { code: 'P2002', message: 'Unique constraint failed' };
      mockPrismaService.stellarWebhookLog.create.mockRejectedValue(duplicateError);

      const payload = { transaction_hash: 'tx123' };
      // Should not throw
      await expect(
        service.logWebhookDelivery('tx123', payload),
      ).resolves.not.toThrow();
    });
  });

  describe('processWebhook', () => {
    const validPayload = JSON.stringify({
      transaction_hash: 'tx_abc123',
      operations: [
        {
          type: 'payment',
          memo: 'CLIPS-1-abc123',
          destination: 'GAAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQDZ7H',
          asset_code: 'xlm',
          amount: 10,
        },
      ],
    });

    const generateValidSignature = (payload: string): string => {
      const secret = 'test_webhook_secret_32_chars_long!!';
      return crypto.createHmac('sha256', secret).update(payload).digest('hex');
    };

    it('should process valid webhook successfully', async () => {
      const signature = generateValidSignature(validPayload);

      mockPrismaService.stellarWebhookLog.findUnique.mockResolvedValue(null);
      mockPrismaService.stellarWebhookLog.create.mockResolvedValue({ id: 1 });
      mockPrismaService.stellarPaymentIntent.findFirst.mockResolvedValue({
        id: 'intent123',
        memo: 'CLIPS-1-abc123',
        destination: 'GAAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQDZ7H',
        asset: 'xlm',
        amount: 10,
        status: 'pending',
        userId: 1,
        plan: 'pro',
      });
      mockPrismaService.stellarPaymentIntent.update.mockResolvedValue({});
      mockPrismaService.subscription.updateMany.mockResolvedValue({});
      mockPrismaService.subscription.create.mockResolvedValue({ id: 1 });

      const result = await service.processWebhook(validPayload, signature);

      expect(result.success).toBe(true);
      expect(result.message).toBe('Webhook processed successfully');
    });

    it('should reject webhook with invalid signature', async () => {
      const invalidSignature = 'invalid_signature';

      await expect(
        service.processWebhook(validPayload, invalidSignature),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should reject webhook with missing signature', async () => {
      await expect(
        service.processWebhook(validPayload, ''),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should detect and return success for duplicate webhooks', async () => {
      const signature = generateValidSignature(validPayload);

      // Simulate already processed webhook
      mockPrismaService.stellarWebhookLog.findUnique.mockResolvedValue({
        id: 1,
        transactionId: 'tx_abc123',
      });

      const result = await service.processWebhook(validPayload, signature);

      expect(result.success).toBe(true);
      expect(result.message).toBe('Duplicate webhook - already processed');
    });

    it('should reject invalid JSON payload', async () => {
      const invalidPayload = 'not valid json';
      const signature = generateValidSignature(invalidPayload);

      await expect(
        service.processWebhook(invalidPayload, signature),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject payload missing transaction hash', async () => {
      const payloadWithoutHash = JSON.stringify({ operations: [] });
      const signature = generateValidSignature(payloadWithoutHash);

      await expect(
        service.processWebhook(payloadWithoutHash, signature),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
