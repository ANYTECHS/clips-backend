import { Test, TestingModule } from '@nestjs/testing';
import { StellarPaymentListener } from './stellar-payment.listener';
import { StellarConfig } from './stellar.config';
import { PrismaService } from '../prisma/prisma.service';

// ── Minimal stubs ────────────────────────────────────────────────────────────

function makeConfig(overrides: Partial<StellarConfig> = {}): StellarConfig {
  const cfg = new StellarConfig();
  return Object.assign(cfg, {
    horizonUrl: 'https://horizon-testnet.stellar.org',
    receiverAddress: 'RECEIVER_ADDR',
    assetCode: 'XLM',
    assetIssuer: '',
    pollIntervalMs: 10000,
    planAmounts: { basic: '5', pro: '15', elite: '30' },
    ...overrides,
  });
}

const mockPrisma = {
  subscription: {
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  payout: { create: jest.fn() },
  $transaction: jest.fn(),
};

// ── Tests ────────────────────────────────────────────────────────────────────

describe('StellarPaymentListener', () => {
  let listener: StellarPaymentListener;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StellarPaymentListener,
        { provide: StellarConfig, useValue: makeConfig() },
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    listener = module.get<StellarPaymentListener>(StellarPaymentListener);

    // Prevent real Horizon stream from opening during tests
    jest
      .spyOn(listener as any, 'startStreaming')
      .mockImplementation(() => undefined);
  });

  describe('handlePaymentRecord', () => {
    const baseRecord = {
      id: 'op-1',
      type: 'payment',
      asset_type: 'native', // XLM
      amount: '15',
      transaction_hash: 'tx-abc',
    };

    it('skips non-payment operations', async () => {
      await listener.handlePaymentRecord({ ...baseRecord, type: 'create_account' });
      expect(mockPrisma.subscription.findFirst).not.toHaveBeenCalled();
    });

    it('skips payments with wrong asset', async () => {
      const cfg = makeConfig({ assetCode: 'USDC', assetIssuer: 'ISSUER' });
      const mod = await Test.createTestingModule({
        providers: [
          StellarPaymentListener,
          { provide: StellarConfig, useValue: cfg },
          { provide: PrismaService, useValue: mockPrisma },
        ],
      }).compile();
      const svc = mod.get<StellarPaymentListener>(StellarPaymentListener);
      jest.spyOn(svc as any, 'startStreaming').mockImplementation(() => undefined);

      await svc.handlePaymentRecord(baseRecord);
      expect(mockPrisma.subscription.findFirst).not.toHaveBeenCalled();
    });

    it('skips when no memo is found on the transaction', async () => {
      jest.spyOn(listener as any, 'fetchMemo').mockResolvedValue(undefined);
      await listener.handlePaymentRecord(baseRecord);
      expect(mockPrisma.subscription.findFirst).not.toHaveBeenCalled();
    });

    it('skips when no pending subscription matches the memo', async () => {
      jest.spyOn(listener as any, 'fetchMemo').mockResolvedValue('SUB-999');
      mockPrisma.subscription.findFirst.mockResolvedValue(null);

      await listener.handlePaymentRecord(baseRecord);
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('skips when amount does not match the plan', async () => {
      jest.spyOn(listener as any, 'fetchMemo').mockResolvedValue('SUB-1');
      mockPrisma.subscription.findFirst.mockResolvedValue({
        id: 1,
        userId: 42,
        plan: 'pro',
        status: 'pending',
        stellarMemo: 'SUB-1',
      });

      // amount is '5' but pro plan expects '15'
      await listener.handlePaymentRecord({ ...baseRecord, amount: '5' });
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('activates subscription and creates Payout when memo + amount match', async () => {
      jest.spyOn(listener as any, 'fetchMemo').mockResolvedValue('SUB-1');
      mockPrisma.subscription.findFirst.mockResolvedValue({
        id: 1,
        userId: 42,
        plan: 'pro',
        status: 'pending',
        stellarMemo: 'SUB-1',
      });
      mockPrisma.$transaction.mockResolvedValue(undefined);

      await listener.handlePaymentRecord({ ...baseRecord, amount: '15' });

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      // Verify the two operations passed to $transaction
      const ops = mockPrisma.$transaction.mock.calls[0][0];
      expect(ops).toHaveLength(2);
    });
  });

  describe('amountsMatch (private)', () => {
    it('returns true for equal decimal strings', () => {
      expect((listener as any).amountsMatch('15.0000000', '15')).toBe(true);
    });

    it('returns false for different amounts', () => {
      expect((listener as any).amountsMatch('5', '15')).toBe(false);
    });
  });
});
