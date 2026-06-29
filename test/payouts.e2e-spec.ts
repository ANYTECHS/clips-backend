import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, ExecutionContext } from '@nestjs/common';
import request from 'supertest';
import { PayoutsController } from '../src/payouts/payouts.controller';
import { PayoutsService } from '../src/payouts/payouts.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { StellarService } from '../src/stellar/stellar.service';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard';
import { PayoutReceiptService } from '../src/payouts/payout-receipt.service';
import { FeeService } from '../src/payouts/fee.service';
import { EarningsService } from '../src/earnings/earnings.service';
import { PayoutApprovalService } from '../src/payouts/payout-approval.service';
import { PAYOUT_RETRY_QUEUE } from '../src/payouts/payout-retry.queue';
import * as StellarSdk from '@stellar/stellar-sdk';

const USER_ID = 9001;

const mockPrisma: any = {
  payout: {
    findFirst: jest.fn(),
    create: jest.fn(),
    aggregate: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  earning: {
    aggregate: jest.fn(),
  },
  wallet: {
    findFirst: jest.fn(),
  },
  payoutMethod: {
    findFirst: jest.fn(),
  },
};

const mockStellarService = {
  horizonUrl: 'https://horizon-testnet.stellar.org',
  networkPassphrase: 'Test SDF Network ; September 2015',
  getAccountBalance: jest.fn(),
  validateAddress: jest.fn().mockReturnValue({ valid: true }),
};

const mockFeeService = {
  calculateFee: jest.fn(),
};

const mockReceiptService = {
  generateAndSendReceipt: jest.fn(),
};

const mockQueue = { add: jest.fn() };

class AuthenticatedGuard {
  canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest();
    req.user = { userId: USER_ID, email: 'user@example.com' };
    return true;
  }
}

describe('Payouts E2E', () => {
  let app: INestApplication;

  async function buildApp() {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [PayoutsController],
      providers: [
        PayoutsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: StellarService, useValue: mockStellarService },
        { provide: PayoutReceiptService, useValue: mockReceiptService },
        { provide: EarningsService, useValue: {} },
        { provide: FeeService, useValue: mockFeeService },
        { provide: PayoutApprovalService, useValue: { resolveInitialStatus: () => 'approved' } },
        { provide: PAYOUT_RETRY_QUEUE, useValue: mockQueue },
        // InjectQueue uses a Bull-specific token of the form `BullQueue_${queueName}`
        { provide: `BullQueue_${PAYOUT_RETRY_QUEUE}`, useValue: mockQueue },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(AuthenticatedGuard)
      .compile();

    const a = moduleFixture.createNestApplication();
    a.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await a.init();
    return a;
  }

  beforeEach(async () => {
    jest.clearAllMocks();
    app = await buildApp();
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  it('POST /payouts/request creates a payout record (stellar)', async () => {
    // No existing pending payout
    mockPrisma.payout.findFirst.mockResolvedValue(null);

    // Earnings total 120, nothing paid out
    mockPrisma.earning.aggregate.mockResolvedValue({ _sum: { amount: 120 } });
    mockPrisma.payout.aggregate.mockResolvedValue({ _sum: { amount: 0 } });

    // Wallet exists for stellar method
    mockPrisma.wallet.findFirst.mockResolvedValue({ id: 11, address: 'GDEST' });

    // Fee calculation
    mockFeeService.calculateFee.mockResolvedValue({ feeAmount: 1, feePercentage: 1, finalAmount: 119 });

    const created = {
      id: 7,
      userId: USER_ID,
      walletId: 11,
      amount: 120,
      currency: 'USD',
      method: 'stellar',
      status: 'pending',
      feeAmount: 1,
      finalAmount: 119,
      createdAt: new Date(),
    };
    mockPrisma.payout.create.mockResolvedValue(created);

    const res = await request(app.getHttpServer())
      .post('/payouts/request')
      .send({ amount: 120, currency: 'USD', method: 'stellar' })
      .expect(201);

    expect(res.body.id).toBe(7);
    expect(mockPrisma.payout.create).toHaveBeenCalled();
  });

  it('validates minimum payout amount', async () => {
    mockPrisma.payout.findFirst.mockResolvedValue(null);

    // Request below default min (10)
    await request(app.getHttpServer())
      .post('/payouts/request')
      .send({ amount: 5, currency: 'USD', method: 'stellar' })
      .expect(400);
  });

  it('validates insufficient balance', async () => {
    mockPrisma.payout.findFirst.mockResolvedValue(null);
    // Earnings total 20, already paid 0 -> available 20
    mockPrisma.earning.aggregate.mockResolvedValue({ _sum: { amount: 20 } });
    mockPrisma.payout.aggregate.mockResolvedValue({ _sum: { amount: 0 } });

    await request(app.getHttpServer())
      .post('/payouts/request')
      .send({ amount: 50, currency: 'USD', method: 'stellar' })
      .expect(400);
  });

  it('POST /payouts/initiate-stellar prepares a pending Stellar payout transaction', async () => {
    const destination = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';

    mockPrisma.payout.findFirst
      .mockResolvedValueOnce({
        id: 101,
        userId: USER_ID,
        amount: 100,
        currency: 'USD',
        method: 'stellar',
        status: 'approved',
        wallet: { address: destination },
        transactionId: null,
      })
      .mockResolvedValueOnce(null);

    mockStellarService.getAccountBalance.mockResolvedValue(200);
    mockPrisma.payout.update.mockResolvedValue({
      id: 101,
      amount: 100,
      status: 'pending',
    });

    jest.spyOn(StellarSdk.Horizon.Server.prototype, 'loadAccount').mockResolvedValue({
      sequenceNumber: () => '1',
      accountId: () => 'GPLATFORM',
    } as any);
    jest.spyOn(StellarSdk.Keypair, 'fromSecret').mockReturnValue({
      publicKey: () => 'GPLATFORM',
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
        hash: () => Buffer.from('abcd', 'hex'),
        toXDR: () => 'mock-stellar-xdr',
      };
    });

    process.env.STELLAR_PLATFORM_SECRET = 'SOME_SECRET';
    process.env.STELLAR_WALLET_ADDRESS = 'GPLATFORM';

    const res = await request(app.getHttpServer())
      .post('/payouts/initiate-stellar')
      .send({ payoutId: 101, amount: 100 })
      .expect(201);

    expect(res.body.status).toBe('pending');
    expect(res.body.stellarXdr).toBe('mock-stellar-xdr');
    expect(res.body.transactionId).toBe('abcd');
  });
});

describe('PayoutsService processPayout (unit)', () => {
  let payoutsService: PayoutsService;

  beforeEach(() => {
    jest.clearAllMocks();

    const validPk = StellarSdk.Keypair.random().publicKey();
    const prismaMock = {
      payout: {
        findUnique: jest.fn().mockResolvedValue({
          id: 123,
          amount: 10,
          currency: 'USD',
          status: 'pending',
          stellarXdr: null,
          retryCount: 0,
          wallet: { address: validPk },
          user: { id: USER_ID, email: 'user@example.com' },
        }),
        update: jest.fn().mockResolvedValue(true),
      },
    } as any;

    const mockStellarSvc = { horizonUrl: 'https://horizon-testnet.stellar.org', networkPassphrase: 'Test' } as any;

    // Mock Stellar network calls and builders to avoid real encoding/validation
    jest.spyOn(StellarSdk.Horizon.Server.prototype, 'loadAccount').mockResolvedValue({ sequenceNumber: () => '1', accountId: () => 'GFAKE' } as any);
    jest.spyOn(StellarSdk.Horizon.Server.prototype, 'submitTransaction').mockResolvedValue({ hash: 'FAKE_HASH' });
    jest.spyOn(StellarSdk.Keypair, 'fromSecret').mockReturnValue({ publicKey: () => 'GFAKE', sign: () => Buffer.from([]) } as any);
    jest.spyOn(StellarSdk.Operation, 'payment').mockImplementation(() => ({} as any));

    // Stub TransactionBuilder methods so the production flow can execute without
    // requiring a real Stellar transaction encoding/validation path.
    jest.spyOn(StellarSdk.TransactionBuilder.prototype, 'addOperation').mockImplementation(function () {
      return this;
    });
    jest.spyOn(StellarSdk.TransactionBuilder.prototype, 'setTimeout').mockImplementation(function () {
      return this;
    });
    jest.spyOn(StellarSdk.TransactionBuilder.prototype, 'build').mockImplementation(function () {
      return {
        sign: () => {},
        hash: () => Buffer.from('deadbeef'),
      };
    });

    payoutsService = new PayoutsService(
      prismaMock as any,
      mockStellarSvc,
      mockReceiptService as any,
      mockFeeService as any,
      mockQueue as any,
    );
  });

  it('processPayout completes and updates DB when Stellar succeeds', async () => {
    // Ensure platform secret is set for the service
    process.env.STELLAR_PLATFORM_SECRET = 'SOME_SECRET';

    // Call processPayout and ensure it returns completed status
    const result = await payoutsService.processPayout(123);
    expect(result.status).toBe('completed');
    expect(result.onChainTxHash).toBe('FAKE_HASH');
  });
});
