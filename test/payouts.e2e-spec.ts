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
    updateMany: jest.fn(),
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
    mockPrisma.payout.updateMany.mockResolvedValue({ count: 1 });

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
    expect(mockPrisma.payout.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 101,
          userId: USER_ID,
          transactionId: null,
          stellarXdr: null,
        }),
        data: expect.objectContaining({
          status: 'pending',
          transactionId: 'abcd',
          stellarXdr: 'mock-stellar-xdr',
        }),
      }),
    );
    const preparedData = mockPrisma.payout.updateMany.mock.calls[0][0].data;
    expect(preparedData).not.toHaveProperty('externalTransactionId');
    expect(preparedData).not.toHaveProperty('onChainTxHash');
  });

  it('rejects Stellar payout amounts that cannot be represented on-chain', async () => {
    await request(app.getHttpServer())
      .post('/payouts/initiate-stellar')
      .send({ payoutId: 101, amount: 100.00000001 })
      .expect(400);
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

  // ── GET /payouts/export (comprehensive) ──────────────────────────────────

  describe('GET /payouts/export', () => {
    it('returns CSV file with correct content type and headers', async () => {
      mockPrisma.payout.findMany.mockResolvedValue([
        {
          id: 1,
          amount: 100,
          currency: 'USD',
          method: 'stellar',
          status: 'completed',
          transactionId: 'tx_001',
          feeAmount: 2,
          finalAmount: 98,
          createdAt: new Date('2026-01-15T12:00:00.000Z'),
          paidAt: new Date('2026-01-15T13:00:00.000Z'),
        },
      ]);

      const response = await request(app.getHttpServer())
        .get('/payouts/export')
        .query({ format: 'csv' })
        .expect(200);

      expect(response.type).toContain('text/csv');
      expect(response.body.toString()).toContain('id');
      expect(response.body.toString()).toContain('status');
      expect(response.body.toString()).toContain('completed');
      expect(response.body.toString()).toContain('stellar');
    });

    it('returns PDF file with correct content-type', async () => {
      mockPrisma.payout.findMany.mockResolvedValue([
        {
          id: 1,
          amount: 100,
          currency: 'USD',
          method: 'stellar',
          status: 'completed',
          transactionId: 'tx_abc',
          feeAmount: 2,
          finalAmount: 98,
          createdAt: new Date('2026-01-15T12:00:00.000Z'),
          paidAt: new Date('2026-01-15T13:00:00.000Z'),
        },
      ]);

      const response = await request(app.getHttpServer())
        .get('/payouts/export')
        .query({ format: 'pdf' })
        .expect(200);

      expect(response.type).toBe('application/pdf');
      expect(response.body.length).toBeGreaterThan(0);
    });

    it('filters by startDate and endDate', async () => {
      mockPrisma.payout.findMany.mockResolvedValue([]);

      await request(app.getHttpServer())
        .get('/payouts/export')
        .query({
          format: 'csv',
          startDate: '2026-01-01',
          endDate: '2026-01-31',
        })
        .expect(200);

      const call = mockPrisma.payout.findMany.mock.calls[0][0];
      expect(call.where.createdAt).toBeDefined();
      expect(call.where.createdAt.gte).toBeDefined();
      expect(call.where.createdAt.lte).toBeDefined();
    });

    it('rejects invalid format', async () => {
      const response = await request(app.getHttpServer())
        .get('/payouts/export')
        .query({ format: 'xlsx' })
        .expect(400);

      expect(response.body.message).toContain('Invalid export format');
    });

    it('requires format query parameter', async () => {
      const response = await request(app.getHttpServer())
        .get('/payouts/export')
        .expect(400);

      expect(response.body.message).toBeDefined();
    });

    it('includes feeAmount and finalAmount in CSV export', async () => {
      mockPrisma.payout.findMany.mockResolvedValue([
        {
          id: 1,
          amount: 500,
          currency: 'USD',
          method: 'stellar',
          status: 'completed',
          transactionId: 'tx_001',
          feeAmount: 10,
          finalAmount: 490,
          createdAt: new Date('2026-01-15T12:00:00.000Z'),
          paidAt: new Date('2026-01-15T13:00:00.000Z'),
        },
      ]);

      const response = await request(app.getHttpServer())
        .get('/payouts/export')
        .query({ format: 'csv' })
        .expect(200);

      const csv = response.body.toString('utf-8');
      expect(csv).toContain('10'); // feeAmount
      expect(csv).toContain('490'); // finalAmount
      expect(csv).toContain('500'); // amount
    });

    it('handles empty payout list gracefully', async () => {
      mockPrisma.payout.findMany.mockResolvedValue([]);

      const response = await request(app.getHttpServer())
        .get('/payouts/export')
        .query({ format: 'csv' })
        .expect(200);

      expect(response.type).toContain('text/csv');
      // Should contain headers
      expect(response.body.toString()).toContain('status');
    });

    it('sets correct Content-Disposition header for download', async () => {
      mockPrisma.payout.findMany.mockResolvedValue([]);

      const response = await request(app.getHttpServer())
        .get('/payouts/export')
        .query({ format: 'csv' })
        .expect(200);

      expect(response.headers['content-disposition']).toBeDefined();
      expect(response.headers['content-disposition']).toContain('attachment');
      expect(response.headers['content-disposition']).toMatch(/payouts-\d{4}-\d{2}-\d{2}\.csv/);
    });

    it('only exports payouts for the authenticated user', async () => {
      mockPrisma.payout.findMany.mockResolvedValue([]);

      await request(app.getHttpServer())
        .get('/payouts/export')
        .query({ format: 'csv' })
        .expect(200);

      const call = mockPrisma.payout.findMany.mock.calls[0][0];
      expect(call.where.userId).toBe(USER_ID);
    });

    it('excludes soft-deleted payouts (deletedAt is null)', async () => {
      mockPrisma.payout.findMany.mockResolvedValue([]);

      await request(app.getHttpServer())
        .get('/payouts/export')
        .query({ format: 'csv' })
        .expect(200);

      const call = mockPrisma.payout.findMany.mock.calls[0][0];
      expect(call.where.deletedAt).toBe(null);
    });

    it('handles multiple payouts with different statuses in single export', async () => {
      mockPrisma.payout.findMany.mockResolvedValue([
        {
          id: 1,
          amount: 100,
          currency: 'USD',
          method: 'stellar',
          status: 'completed',
          transactionId: 'tx_001',
          feeAmount: 2,
          finalAmount: 98,
          createdAt: new Date('2026-01-15T12:00:00.000Z'),
          paidAt: new Date('2026-01-15T13:00:00.000Z'),
        },
        {
          id: 2,
          amount: 150,
          currency: 'USD',
          method: 'bank_transfer',
          status: 'pending',
          transactionId: null,
          feeAmount: 3,
          finalAmount: 147,
          createdAt: new Date('2026-01-20T10:00:00.000Z'),
          paidAt: null,
        },
      ]);

      const response = await request(app.getHttpServer())
        .get('/payouts/export')
        .query({ format: 'csv' })
        .expect(200);

      const csv = response.body.toString('utf-8');
      expect(csv).toContain('completed');
      expect(csv).toContain('pending');
      expect(csv).toContain('100');
      expect(csv).toContain('150');
    });
  });

  // ── Fee calculations integrated with payout responses ────────────────────

  describe('Fee calculations and payout responses', () => {
    it('calculates and includes feeAmount and finalAmount in payout list', async () => {
      mockPrisma.payout.findMany.mockResolvedValue([
        {
          id: 7,
          userId: USER_ID,
          amount: 100,
          currency: 'USD',
          method: 'stellar',
          status: 'completed',
          feeAmount: 2,
          finalAmount: 98,
          transactionId: 'tx_001',
          createdAt: new Date(),
          paidAt: new Date(),
        },
      ]);

      const response = await request(app.getHttpServer())
        .get('/payouts')
        .expect(200);

      expect(response.body[0]).toHaveProperty('feeAmount', 2);
      expect(response.body[0]).toHaveProperty('finalAmount', 98);
      expect(response.body[0].amount).toBe(100);
    });

    it('fee preview shows gross/net breakdown for user confirmation', async () => {
      mockFeeService.previewFee.mockResolvedValue({
        amount: 100,
        grossAmount: 100,
        fee: 2,
        feeAmount: 2,
        feePercentage: 2,
        netAmount: 98,
        finalAmount: 98,
        currency: 'USD',
      });

      const response = await request(app.getHttpServer())
        .get('/payouts/fees/preview')
        .query({ amount: 100, method: 'stellar' })
        .expect(200);

      expect(response.body.amount).toBe(100);
      expect(response.body.fee).toBe(2);
      expect(response.body.netAmount).toBe(98);
    });

    it('prevents payouts when fee would result in zero or negative net amount', async () => {
      mockFeeService.calculateFee.mockRejectedValueOnce(
        new BadRequestException(
          'Fee ($20) would leave a non-positive net payout for amount $10',
        ),
      );

      const response = await request(app.getHttpServer())
        .post('/payouts/request')
        .send({
          amount: 10,
          walletId: 1,
          reason: 'test',
        })
        .expect(400);

      expect(response.body.message).toContain('non-positive');
    });
  });
