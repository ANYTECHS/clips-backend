import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { StellarPaymentService } from '../src/subscriptions/stellar-payment.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { StellarService } from '../src/stellar/stellar.service';

jest.mock('../src/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));
jest.mock('@stellar/stellar-sdk', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    transactionsTransaction: jest.fn(),
  })),
  TransactionBuilder: jest.fn(),
  Networks: {},
  Operation: {},
  Asset: {},
}));

class InMemoryPrisma {
  wallet = {
    findFirst: jest.fn(async ({ where }) => {
      return this.wallets.find(
        (w) =>
          w.userId === where.userId &&
          (!where.id || w.id === where.id) &&
          !w.deletedAt,
      );
    }),
  };

  stellarPaymentIntent = {
    create: jest.fn(async ({ data }) => {
      const intent = { id: `intent-${this.intents.length + 1}`, ...data };
      this.intents.push(intent);
      return intent;
    }),
    findFirst: jest.fn(async ({ where }) => {
      return this.intents.find((intent) => {
        if (where.memo && intent.memo !== where.memo) return false;
        if (where.status && intent.status !== where.status) return false;
        if (where.transactionId && intent.transactionId !== where.transactionId)
          return false;
        return true;
      });
    }),
    update: jest.fn(async ({ where, data }) => {
      const idx = this.intents.findIndex((i) => i.id === where.id);
      this.intents[idx] = { ...this.intents[idx], ...data };
      return this.intents[idx];
    }),
    findMany: jest.fn(async ({ where }) =>
      this.intents.filter((i) => i.userId === where.userId),
    ),
    updateMany: jest.fn(async () => ({ count: 0 })),
  };

  subscription = {
    updateMany: jest.fn(async () => ({ count: 0 })),
    create: jest.fn(async ({ data }) => {
      this.subscriptions.push({ id: this.subscriptions.length + 1, ...data });
      return this.subscriptions[this.subscriptions.length - 1];
    }),
  };

  wallets = [{ id: 1, userId: 1, address: 'GDESTINATION', deletedAt: null }];
  intents: any[] = [];
  subscriptions: any[] = [];
}

describe('Subscription flow integration', () => {
  let service: StellarPaymentService;
  let prisma: InMemoryPrisma;

  beforeEach(async () => {
    prisma = new InMemoryPrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StellarPaymentService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('https://horizon-testnet.stellar.org') },
        },
        {
          provide: StellarService,
          useValue: { validateAddress: jest.fn().mockReturnValue({ valid: true }) },
        },
      ],
    }).compile();

    service = module.get(StellarPaymentService);
  });

  it('creates payment intent with memo and destination', async () => {
    const intent = await service.createPaymentIntent(1, {
      plan: 'pro',
      asset: 'xlm',
      amount: 10,
      walletId: '1',
    });

    expect(intent.memo).toBeTruthy();
    expect(intent.destination).toBe('GDESTINATION');
  });

  it('activates subscription for matching payment', async () => {
    const intent = await service.createPaymentIntent(1, {
      plan: 'pro',
      asset: 'xlm',
      amount: 10,
      walletId: '1',
    });

    const ok = await service.processDetectedPayment({
      memo: intent.memo,
      amount: 10,
      transactionId: 'tx-1',
    });

    expect(ok).toBe(true);
    expect(prisma.subscriptions).toHaveLength(1);
  });

  it('does not activate on wrong amount', async () => {
    const intent = await service.createPaymentIntent(1, {
      plan: 'pro',
      asset: 'xlm',
      amount: 10,
      walletId: '1',
    });
    const ok = await service.processDetectedPayment({
      memo: intent.memo,
      amount: 9.99,
      transactionId: 'tx-2',
    });

    expect(ok).toBe(false);
    expect(prisma.subscriptions).toHaveLength(0);
  });

  it('is idempotent for duplicate transaction id', async () => {
    const intent = await service.createPaymentIntent(1, {
      plan: 'pro',
      asset: 'xlm',
      amount: 10,
      walletId: '1',
    });
    await service.processDetectedPayment({
      memo: intent.memo,
      amount: 10,
      transactionId: 'tx-3',
    });
    const duplicate = await service.processDetectedPayment({
      memo: intent.memo,
      amount: 10,
      transactionId: 'tx-3',
    });

    expect(duplicate).toBe(true);
    expect(prisma.subscriptions).toHaveLength(1);
  });

  it('rejects expired intent older than 15 minutes', async () => {
    const intent = await service.createPaymentIntent(1, {
      plan: 'pro',
      asset: 'xlm',
      amount: 10,
      walletId: '1',
    });
    await prisma.stellarPaymentIntent.update({
      where: { id: intent.id },
      data: { expiresAt: new Date(Date.now() - 16 * 60 * 1000) },
    });

    const ok = await service.processDetectedPayment({
      memo: intent.memo,
      amount: 10,
      transactionId: 'tx-4',
    });

    expect(ok).toBe(false);
    expect(prisma.subscriptions).toHaveLength(0);
  });
});
