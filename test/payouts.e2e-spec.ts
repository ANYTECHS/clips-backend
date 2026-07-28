import { Test, TestingModule } from '@nestjs/testing';
import {
  INestApplication,
  ValidationPipe,
  ExecutionContext,
} from '@nestjs/common';
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
import { ConfigService } from '../src/config/config.service';
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
        {
          provide: PayoutApprovalService,
          useValue: { resolveInitialStatus: () => 'approved' },
        },
        {
          provide: ConfigService,
          useValue: { minStellarPayout: 10, platformWallet: 'GPLATFORM' },
        },
        { provide: PAYOUT_RETRY_QUEUE, useValue: mockQueue },
        // InjectQueue uses a Bull-specific token of the form `BullQueue_${queueName}`
        { provide: `BullQueue_${PAYOUT_RETRY_QUEUE}`, useValue: mockQueue },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(AuthenticatedGuard)
      .compile();

    const a = moduleFixture.createNestApplication();
    a.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await a.listen(0, '127.0.0.1');
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
    mockFeeService.calculateFee.mockResolvedValue({
      feeAmount: 1,
      feePercentage: 1,
      finalAmount: 119,
    });

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

  it('trims string fields and transforms numeric payloads for payout requests', async () => {
    mockPrisma.payout.findFirst.mockResolvedValue(null);
    mockPrisma.earning.aggregate.mockResolvedValue({ _sum: { amount: 120 } });
    mockPrisma.payout.aggregate.mockResolvedValue({ _sum: { amount: 0 } });
    mockPrisma.wallet.findFirst.mockResolvedValue({ id: 11, address: 'GDEST' });
    mockFeeService.calculateFee.mockResolvedValue({
      feeAmount: 1,
      feePercentage: 1,
      finalAmount: 119,
    });
    mockPrisma.payout.create.mockResolvedValue({
      id: 8,
      userId: USER_ID,
      walletId: 11,
      amount: 120,
      currency: 'USD',
      method: 'stellar',
      status: 'pending',
      feeAmount: 1,
      finalAmount: 119,
      createdAt: new Date(),
    });

    await request(app.getHttpServer())
      .post('/payouts/request')
      .send({ amount: '120', currency: ' USD ', method: ' stellar ' })
      .expect(201);

    expect(mockPrisma.payout.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          amount: 120,
          currency: 'USD',
          method: 'stellar',
        }),
      }),
    );
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

  it('rejects unexpected properties on payout request payloads', async () => {
    await request(app.getHttpServer())
      .post('/payouts/request')
      .send({
        amount: 120,
        currency: 'USD',
        method: 'stellar',
        unexpected: 'nope',
      })
      .expect(400)
      .expect(({ body }) => {
        expect(body.message).toContain('property unexpected should not exist');
      });
  });

  it('POST /payouts/initiate-stellar prepares a pending unsigned Stellar payout transaction', async () => {
    const destination =
      'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';

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

    jest
      .spyOn(StellarSdk.Horizon.Server.prototype, 'loadAccount')
      .mockResolvedValue({
        sequenceNumber: () => '1',
        accountId: () => 'GPLATFORM',
      } as any);
    jest
      .spyOn(StellarSdk.Operation, 'payment')
      .mockImplementation(() => ({}) as any);
    jest
      .spyOn(StellarSdk.TransactionBuilder.prototype, 'addOperation')
      .mockImplementation(function () {
        return this;
      });
    jest
      .spyOn(StellarSdk.TransactionBuilder.prototype, 'setTimeout')
      .mockImplementation(function () {
        return this;
      });
    const signSpy = jest.fn();
    jest
      .spyOn(StellarSdk.TransactionBuilder.prototype, 'build')
      .mockImplementation(function () {
        return {
          sign: signSpy,
          hash: () => Buffer.from('abcd', 'hex'),
          toXDR: () => 'mock-stellar-xdr',
        };
      });

    process.env.STELLAR_WALLET_ADDRESS = 'GPLATFORM';

    const res = await request(app.getHttpServer())
      .post('/payouts/initiate-stellar')
      .send({ payoutId: 101, amount: 100 })
      .expect(201);

    expect(res.body.status).toBe('pending');
    expect(res.body.stellarXdr).toBe('mock-stellar-xdr');
    expect(res.body.transactionId).toBe('abcd');
    expect(signSpy).not.toHaveBeenCalled();
  });

  it('rejects unexpected properties on initiate-stellar payloads', async () => {
    await request(app.getHttpServer())
      .post('/payouts/initiate-stellar')
      .send({ payoutId: 101, amount: 100, unexpected: true })
      .expect(400)
      .expect(({ body }) => {
        expect(body.message).toContain('property unexpected should not exist');
      });
  });
});
