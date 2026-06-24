import { Test, TestingModule } from '@nestjs/testing';
import { StellarWebhookController } from './stellar-webhook.controller';
import { StellarWebhookService } from './stellar-webhook.service';
import { UnauthorizedException, BadRequestException } from '@nestjs/common';

describe('StellarWebhookController', () => {
  let controller: StellarWebhookController;
  let webhookService: StellarWebhookService;

  const mockWebhookService = {
    processWebhook: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [StellarWebhookController],
      providers: [
        { provide: StellarWebhookService, useValue: mockWebhookService },
      ],
    }).compile();

    controller = module.get<StellarWebhookController>(StellarWebhookController);
    webhookService = module.get<StellarWebhookService>(StellarWebhookService);
  });

  describe('receiveWebhook', () => {
    const validPayload = Buffer.from(
      JSON.stringify({
        transaction_hash: 'tx_abc123',
        operations: [{ type: 'payment', amount: 10 }],
      }),
    );

    const validSignature = 'valid_signature_hex';

    it('should process valid webhook successfully', async () => {
      mockWebhookService.processWebhook.mockResolvedValue({
        success: true,
        message: 'Webhook processed successfully',
      });

      const result = await controller.receiveWebhook(validPayload, validSignature);

      expect(result).toEqual({
        success: true,
        message: 'Webhook processed successfully',
      });
      expect(mockWebhookService.processWebhook).toHaveBeenCalledWith(
        validPayload,
        validSignature,
      );
    });

    it('should return success for duplicate webhook', async () => {
      mockWebhookService.processWebhook.mockResolvedValue({
        success: true,
        message: 'Duplicate webhook - already processed',
      });

      const result = await controller.receiveWebhook(validPayload, validSignature);

      expect(result).toEqual({
        success: true,
        message: 'Duplicate webhook - already processed',
      });
    });

    it('should throw UnauthorizedException for missing signature header', async () => {
      await expect(
        controller.receiveWebhook(validPayload, ''),
      ).rejects.toThrow(UnauthorizedException);

      expect(mockWebhookService.processWebhook).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException for empty body', async () => {
      await expect(
        controller.receiveWebhook(Buffer.from(''), validSignature),
      ).rejects.toThrow(BadRequestException);

      expect(mockWebhookService.processWebhook).not.toHaveBeenCalled();
    });

    it('should throw UnauthorizedException when service throws it', async () => {
      mockWebhookService.processWebhook.mockRejectedValue(
        new UnauthorizedException('Invalid webhook signature'),
      );

      await expect(
        controller.receiveWebhook(validPayload, validSignature),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw BadRequestException when service throws it', async () => {
      mockWebhookService.processWebhook.mockRejectedValue(
        new BadRequestException('Invalid JSON payload'),
      );

      await expect(
        controller.receiveWebhook(validPayload, validSignature),
      ).rejects.toThrow(BadRequestException);
    });

    it('should handle service errors gracefully', async () => {
      mockWebhookService.processWebhook.mockRejectedValue(
        new Error('Internal service error'),
      );

      await expect(
        controller.receiveWebhook(validPayload, validSignature),
      ).rejects.toThrow();
    });
  });
});
