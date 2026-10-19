import { BadRequestException, NotFoundException } from '@nestjs/common';
import { FeeService } from './fee.service';

describe('FeeService', () => {
  let service: FeeService;
  let prisma: {
    payoutFeeConfig: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
  };

  beforeEach(() => {
    prisma = {
      payoutFeeConfig: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };
    service = new FeeService(prisma as any);
  });

  describe('calculateFee', () => {
    it('calculates percentage fee and returns gross/fee/netAmount', async () => {
      prisma.payoutFeeConfig.findUnique.mockResolvedValue({
        method: 'stellar',
        feeType: 'percentage',
        feePercentage: 2,
        fixedFee: 0,
        minFee: 0,
        maxFee: null,
        isActive: true,
      });

      const result = await service.calculateFee(100, 'stellar', 'USD');

      expect(result).toEqual({
        amount: 100,
        grossAmount: 100,
        fee: 2,
        feeAmount: 2,
        feePercentage: 2,
        netAmount: 98,
        finalAmount: 98,
        currency: 'USD',
      });
    });

    it('calculates fixed fee per payout method', async () => {
      prisma.payoutFeeConfig.findUnique.mockResolvedValue({
        method: 'fiat',
        feeType: 'fixed',
        feePercentage: 0,
        fixedFee: 1.5,
        minFee: 0,
        maxFee: null,
        isActive: true,
      });

      const result = await service.calculateFee(50, 'fiat');
      expect(result.fee).toBe(1.5);
      expect(result.netAmount).toBe(48.5);
      expect(result.amount).toBe(50);
    });

    it('returns zero fee when no active config exists', async () => {
      prisma.payoutFeeConfig.findUnique.mockResolvedValue(null);

      const result = await service.calculateFee(100, 'unknown');
      expect(result.fee).toBe(0);
      expect(result.netAmount).toBe(100);
    });

    it('applies min/max fee bounds', async () => {
      prisma.payoutFeeConfig.findUnique.mockResolvedValue({
        method: 'stellar',
        feeType: 'percentage',
        feePercentage: 1,
        fixedFee: 0,
        minFee: 5,
        maxFee: 10,
        isActive: true,
      });

      // 1% of 100 = 1, raised to minFee 5
      const result = await service.calculateFee(100, 'stellar');
      expect(result.fee).toBe(5);
      expect(result.netAmount).toBe(95);
    });

    it('prevents negative / zero net payouts', async () => {
      prisma.payoutFeeConfig.findUnique.mockResolvedValue({
        method: 'stellar',
        feeType: 'fixed',
        feePercentage: 0,
        fixedFee: 100,
        minFee: 0,
        maxFee: null,
        isActive: true,
      });

      await expect(service.calculateFee(50, 'stellar')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rejects non-positive amounts', async () => {
      await expect(service.calculateFee(0, 'stellar')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      await expect(service.calculateFee(-10, 'stellar')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('previewFee', () => {
    it('mirrors calculateFee for pre-confirmation display', async () => {
      prisma.payoutFeeConfig.findUnique.mockResolvedValue({
        method: 'stellar',
        feeType: 'percentage',
        feePercentage: 2,
        fixedFee: 0,
        minFee: 0,
        maxFee: null,
        isActive: true,
      });

      const result = await service.previewFee(100, 'stellar', 'USD');
      expect(result).toMatchObject({
        amount: 100,
        fee: 2,
        netAmount: 98,
        currency: 'USD',
      });
    });
  });

  describe('getFeeConfig', () => {
    it('throws NotFoundException when missing', async () => {
      prisma.payoutFeeConfig.findUnique.mockResolvedValue(null);
      await expect(service.getFeeConfig('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
