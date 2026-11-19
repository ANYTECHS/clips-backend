import { BadRequestException, ConflictException } from '@nestjs/common';
import { PayoutValidationService } from './payout-validation.service';

describe('PayoutValidationService', () => {
  const prisma = {
    payout: { findFirst: jest.fn() },
    wallet: { findFirst: jest.fn() },
    payoutMethod: { findFirst: jest.fn() },
  };
  const config = { minStellarPayout: 5 };
  const currencyService = { convert: jest.fn() };
  const payoutLimitsService = { getLimits: jest.fn(() => ({ min: 5, max: 10000 })) };
  const payoutApprovalService = {
    canApprove: jest.fn((s: string) => ['pending', 'pending_review', 'pending_approval'].includes(s)),
    canReject: jest.fn((s: string) =>
      ['pending', 'pending_review', 'pending_approval', 'approved'].includes(s),
    ),
  };
  const stellarService = { validateAddress: jest.fn(() => ({ valid: true })) };

  const service = new PayoutValidationService(
    config as any,
    currencyService as any,
    payoutLimitsService as any,
    payoutApprovalService as any,
    stellarService as any,
    prisma as any,
  );

  const initiable = {
    id: 1,
    userId: 7,
    status: 'approved',
    method: 'stellar',
    amount: 100,
    currency: 'USD',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.payout.findFirst.mockResolvedValue(null);
    stellarService.validateAddress.mockReturnValue({ valid: true });
    delete process.env.STELLAR_WALLET_ADDRESS;
    delete process.env.PLATFORM_WALLET_ADDRESS;
  });

  describe('assertMinimumPayout', () => {
    it('rejects USD amounts below the configured minimum', async () => {
      await expect(service.assertMinimumPayout(3, 'USD')).rejects.toThrow(
        'Minimum payout amount is 5 USD equivalent. Requested: 3 USD.',
      );
    });

    it('compares non-USD amounts by their USD equivalent', async () => {
      currencyService.convert.mockResolvedValue({ amount: 2, rate: 0.2 });
      await expect(service.assertMinimumPayout(10, 'XLM')).rejects.toThrow(BadRequestException);
    });

    it('falls back to the raw amount when conversion fails', async () => {
      currencyService.convert.mockRejectedValue(new Error('rates down'));
      await expect(service.assertMinimumPayout(10, 'XLM')).resolves.toBeUndefined();
    });
  });

  it('assertPayoutLimits rejects amounts outside the currency limits', () => {
    expect(() => service.assertPayoutLimits(4, 'USD')).toThrow('Minimum payout for USD is 5');
    expect(() => service.assertPayoutLimits(20000, 'USD')).toThrow('Maximum payout for USD is 10000');
    expect(() => service.assertPayoutLimits(100, 'USD')).not.toThrow();
  });

  it('assertSufficientBalance rejects amounts above the available balance', () => {
    expect(() => service.assertSufficientBalance(100, 80, 'USD')).toThrow(
      'Insufficient balance. Available: 80 USD',
    );
    expect(() => service.assertSufficientBalance(80, 80, 'USD')).not.toThrow();
  });

  it('ensureNoOpenPayout throws ConflictException when an open payout exists', async () => {
    prisma.payout.findFirst.mockResolvedValue({ id: 3 });
    await expect(service.ensureNoOpenPayout(7)).rejects.toThrow(ConflictException);
  });

  it('getActiveStellarWallet / getDefaultPayoutMethod throw when missing', async () => {
    prisma.wallet.findFirst.mockResolvedValue(null);
    prisma.payoutMethod.findFirst.mockResolvedValue(null);
    await expect(service.getActiveStellarWallet(7)).rejects.toThrow(BadRequestException);
    await expect(service.getDefaultPayoutMethod(7)).rejects.toThrow(BadRequestException);
  });

  describe('status transitions', () => {
    it('only allows cancelling pending payouts', () => {
      expect(() => service.assertCanCancel('pending_review')).not.toThrow();
      expect(() => service.assertCanCancel('approved')).toThrow(
        "Cannot cancel payout in 'approved' status",
      );
    });

    it('delegates approve/reject rules to PayoutApprovalService', () => {
      expect(() => service.assertCanApprove('completed')).toThrow(
        "Cannot approve payout in 'completed' status",
      );
      expect(() => service.assertCanReject('approved')).not.toThrow();
    });
  });

  describe('assertStellarInitiable', () => {
    it('accepts an approved Stellar payout with a matching amount', async () => {
      await expect(service.assertStellarInitiable(initiable, 100)).resolves.toBeUndefined();
    });

    it('rejects payouts in a non-initiable status', async () => {
      await expect(
        service.assertStellarInitiable({ ...initiable, status: 'completed' }, 100),
      ).rejects.toThrow('Payout must be approved or pending before Stellar initiation');
    });

    it('rejects non-Stellar payouts and mismatched amounts', async () => {
      await expect(
        service.assertStellarInitiable({ ...initiable, method: 'fiat' }, 100),
      ).rejects.toThrow('Only Stellar payouts can be initiated here');
      await expect(service.assertStellarInitiable(initiable, 99)).rejects.toThrow(
        'Requested amount does not match payout amount',
      );
    });

    it('throws ConflictException when a transaction is already prepared', async () => {
      prisma.payout.findFirst.mockResolvedValue({ id: 1 });
      await expect(service.assertStellarInitiable(initiable, 100)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('assertProcessable', () => {
    it('requires approved status and a wallet', async () => {
      await expect(
        service.assertProcessable({ status: 'pending', amount: 100, currency: 'USD', wallet: { address: 'G' } }),
      ).rejects.toThrow('Payout must be approved before processing');
      await expect(
        service.assertProcessable({ status: 'approved', amount: 100, currency: 'USD', wallet: null }),
      ).rejects.toThrow('No wallet associated with this payout');
    });

    it('returns the payout when processable', async () => {
      const payout = { status: 'approved', amount: 100, currency: 'USD', wallet: { address: 'G' } };
      await expect(service.assertProcessable(payout)).resolves.toBe(payout);
    });

    it('assertNotCompleted rejects completed payouts', () => {
      expect(() => service.assertNotCompleted('completed')).toThrow(
        'Payout is already in completed status',
      );
    });
  });

  describe('Stellar addresses', () => {
    it('requires a configured, valid platform wallet', () => {
      expect(() => service.getPlatformWalletAddress()).toThrow(
        'Platform Stellar wallet address is not configured',
      );

      process.env.STELLAR_WALLET_ADDRESS = 'GPLATFORM';
      expect(service.getPlatformWalletAddress()).toBe('GPLATFORM');

      stellarService.validateAddress.mockReturnValue({ valid: false });
      expect(() => service.getPlatformWalletAddress()).toThrow(
        'Invalid platform Stellar wallet address',
      );
    });

    it('validates the destination address', () => {
      expect(() => service.assertValidDestination(null)).toThrow(
        'No wallet associated with this payout',
      );
      stellarService.validateAddress.mockReturnValue({ valid: false });
      expect(() => service.assertValidDestination('GBAD')).toThrow(
        'Invalid destination Stellar address',
      );
    });

    it('rejects when the platform balance cannot cover the payout', () => {
      expect(() => service.assertSufficientPlatformBalance(42, 100)).toThrow(
        'Insufficient platform balance. Available: 42 XLM',
      );
    });
  });
});
