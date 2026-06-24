import { BadRequestException } from '@nestjs/common';
import { StellarPaymentService } from './stellar-payment.service';

const mockPrisma = {
  wallet: {
    findFirst: jest.fn(),
  },
  stellarPaymentIntent: {
    create: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    findMany: jest.fn(),
  },
  subscription: {
    create: jest.fn(),
  },
};

const mockStellar = {
  validateAddress: jest.fn().mockReturnValue({ valid: true }),
};

describe('StellarPaymentService', () => {
  let service: StellarPaymentService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new StellarPaymentService(
      mockPrisma as any,
      mockStellar as any,
    );
  });

  describe('createPaymentIntent', () => {
    it('throws BadRequestException when wallet not found', async () => {
      mockPrisma.wallet.findFirst.mockResolvedValue(null);

      await expect(
        service.createPaymentIntent(1, { plan: 'pro', asset: 'xlm', amount: 10, walletId: '1' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('creates intent with memo and correct destination', async () => {
      mockPrisma.wallet.findFirst.mockResolvedValue({ id: 1, address: 'GDESTINATION', userId: 1 });
      mockPrisma.stellarPaymentIntent.create.mockImplementation(({ data }) =>
        Promise.resolve({ id: 'intent-1', ...data }),
      );

      const intent = await service.createPaymentIntent(1, {
        plan: 'pro', asset: 'xlm', amount: 10, walletId: '1',
      });

      expect(intent.memo).toBeTruthy();
      expect(intent.destination).toBe('GDESTINATION');
      expect(intent.plan).toBe('pro');
      expect(intent.amount).toBe(10);
    });

    it('sets expiry 15 minutes in the future', async () => {
      mockPrisma.wallet.findFirst.mockResolvedValue({ id: 1, address: 'GDEST', userId: 1 });
      const before = Date.now();
      mockPrisma.stellarPaymentIntent.create.mockImplementation(({ data }) =>
        Promise.resolve({ id: 'i1', ...data }),
      );

      const intent = await service.createPaymentIntent(1, {
        plan: 'basic', asset: 'xlm', amount: 5, walletId: '1',
      });

      const expiry = new Date(intent.expiresAt).getTime();
      const expectedMin = before + 14 * 60 * 1000;
      const expectedMax = before + 16 * 60 * 1000;
      expect(expiry).toBeGreaterThanOrEqual(expectedMin);
      expect(expiry).toBeLessThanOrEqual(expectedMax);
    });
  });

  describe('processDetectedPayment', () => {
    it('returns false when no intent matches memo', async () => {
      mockPrisma.stellarPaymentIntent.findFirst.mockResolvedValue(null);

      const result = await service.processDetectedPayment({
        memo: 'NOMATCH', amount: 10, transactionId: 'tx-1',
      });

      expect(result).toBe(false);
    });

    it('activates subscription on matching memo and amount', async () => {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 10 * 60 * 1000);

      mockPrisma.stellarPaymentIntent.findFirst
        .mockResolvedValueOnce(null) // idempotency check
        .mockResolvedValueOnce({
          id: 'i1', userId: 1, amount: 10, plan: 'pro',
          memo: 'MEMO1', status: 'pending', expiresAt,
        });
      mockPrisma.stellarPaymentIntent.update.mockResolvedValue({});
      mockPrisma.subscription.create.mockResolvedValue({ id: 1 });

      const ok = await service.processDetectedPayment({
        memo: 'MEMO1', amount: 10, transactionId: 'tx-ok',
      });

      expect(ok).toBe(true);
      expect(mockPrisma.subscription.create).toHaveBeenCalled();
    });

    it('returns false when amount does not match', async () => {
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

      mockPrisma.stellarPaymentIntent.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          id: 'i2', userId: 1, amount: 10, plan: 'pro',
          memo: 'MEMO2', status: 'pending', expiresAt,
        });

      const ok = await service.processDetectedPayment({
        memo: 'MEMO2', amount: 9.5, transactionId: 'tx-bad',
      });

      expect(ok).toBe(false);
      expect(mockPrisma.subscription.create).not.toHaveBeenCalled();
    });

    it('returns true for duplicate transactionId (idempotency)', async () => {
      mockPrisma.stellarPaymentIntent.findFirst.mockResolvedValueOnce({
        id: 'i3', transactionId: 'tx-dup', status: 'completed',
      });

      const ok = await service.processDetectedPayment({
        memo: 'ANY', amount: 10, transactionId: 'tx-dup',
      });

      expect(ok).toBe(true);
      expect(mockPrisma.subscription.create).not.toHaveBeenCalled();
    });

    it('returns false for expired intent', async () => {
      const expired = new Date(Date.now() - 20 * 60 * 1000);

      mockPrisma.stellarPaymentIntent.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          id: 'i4', userId: 1, amount: 10, plan: 'pro',
          memo: 'MEMO4', status: 'pending', expiresAt: expired,
        });
      mockPrisma.stellarPaymentIntent.update.mockResolvedValue({});

      const ok = await service.processDetectedPayment({
        memo: 'MEMO4', amount: 10, transactionId: 'tx-exp',
      });

      expect(ok).toBe(false);
      expect(mockPrisma.subscription.create).not.toHaveBeenCalled();
      expect(mockPrisma.stellarPaymentIntent.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'expired' }) }),
      );
    });
  });
});
