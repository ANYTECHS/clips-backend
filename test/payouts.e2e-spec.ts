import { Test, TestingModule } from '@nestjs/testing';
import {
  INestApplication,
  ValidationPipe,
  ExecutionContext,
  UnauthorizedException,
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
import { BalanceService } from '../src/payouts/balance.service';
import { PayoutExportService } from '../src/payouts/payout-export.service';
import { PayoutLimitsService } from '../src/payouts/payout-limits.service';
import { PayoutValidationService } from '../src/payouts/payout-validation.service';
import { PayoutProcessingService } from '../src/payouts/payout-processing.service';
import { PayoutRetryStrategyService } from '../src/payouts/payout-retry-strategy.service';
import { StellarPayoutVerificationService } from '../src/payouts/stellar-payout-verification.service';
import { MailService } from '../src/auth/mail.service';
import { CurrencyService } from '../src/common/services/currency.service';
import { createAuthenticatedRequest } from '../src/testing/authenticated-request.util';
import * as StellarSdk from '@stellar/stellar-sdk';

const USER_ID = 9001;
const TEST_USER = { id: USER_ID, email: 'user@example.com' };
const earnings: Array<{ userId: number; amount: number }> = [];
const payouts: Array<Record<string, any>> = [];

const mockPrisma: any = {
  payout: {
    findFirst: jest.fn(),
    create: jest.fn(),
    aggregate: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
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
mockPrisma.$transaction = jest.fn(
  (callback: (transaction: typeof mockPrisma) => Promise<unknown>) =>
    callback(mockPrisma),
);

const mockStellarService = {
  horizonUrl: 'https://horizon-testnet.stellar.org',
  networkPassphrase: 'Test SDF Network ; September 2015',
  getAccountBalance: jest.fn(),
  validateAddress: jest.fn(),
};

const mockFeeService = {
  calculateFee: jest.fn(),
};

const mockReceiptService = {
  generateAndSendReceipt: jest.fn(),
};

const mockQueue = { add: jest.fn() };
const getEarningsSummary = async (userId: number) => {
  const totalEarnings = earnings
    .filter((earning) => earning.userId === userId)
    .reduce((sum, earning) => sum + earning.amount, 0);
  const reservedAmount = payouts
    .filter(
      (payout) =>
        payout.userId === userId &&
        !['failed', 'rejected', 'cancelled'].includes(payout.status),
    )
    .reduce((sum, payout) => sum + payout.amount, 0);

  return {
    totalEarnings,
    availableBalance: totalEarnings - reservedAmount,
  };
};
const mockEarningsService = {
  getUserTotalEarnings: jest.fn(getEarningsSummary),
};

function matchesPayoutWhere(payout: Record<string, any>, where: any): boolean {
  if (where.id !== undefined && payout.id !== where.id) return false;
  if (where.userId !== undefined && payout.userId !== where.userId)
    return false;
  if (where.deletedAt === null && payout.deletedAt !== null) return false;
  if (where.status?.in && !where.status.in.includes(payout.status)) {
    return false;
  }
  if (typeof where.status === 'string' && payout.status !== where.status) {
    return false;
  }
  if (where.transactionId?.not === null && payout.transactionId === null) {
    return false;
  }
  return true;
}

class AuthenticatedGuard {
  canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest();
    if (!req.headers.authorization?.startsWith('Bearer ')) {
      throw new UnauthorizedException();
    }
    req.user = { userId: USER_ID, email: 'user@example.com' };
    return true;
  }
}

describe('Payouts E2E', () => {
  let app: INestApplication;
  let http: ReturnType<typeof createAuthenticatedRequest>;

  async function buildApp() {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [PayoutsController],
      providers: [
        PayoutsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: StellarService, useValue: mockStellarService },
        { provide: PayoutReceiptService, useValue: mockReceiptService },
        { provide: EarningsService, useValue: mockEarningsService },
        { provide: FeeService, useValue: mockFeeService },
        {
          provide: PayoutApprovalService,
          useValue: { resolveInitialStatus: () => 'approved' },
        },
        {
          provide: ConfigService,
          useValue: { minStellarPayout: 10, platformWallet: 'GPLATFORM' },
        },
        {
          provide: CurrencyService,
          useValue: {
            convert: jest.fn(async (amount: number) => ({ amount, rate: 1 })),
          },
        },
        {
          provide: PayoutLimitsService,
          useValue: { getLimits: () => ({ min: 10, max: 10000 }) },
        },
        PayoutValidationService,
        PayoutProcessingService,
        { provide: PayoutRetryStrategyService, useValue: {} },
        { provide: StellarPayoutVerificationService, useValue: {} },
        { provide: MailService, useValue: {} },
        {
          provide: BalanceService,
          useValue: { getAvailableBalance: jest.fn() },
        },
        {
          provide: PayoutExportService,
          useValue: { exportPayouts: jest.fn() },
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
    jest.resetAllMocks();
    earnings.splice(0, earnings.length, { userId: USER_ID, amount: 120 });
    payouts.splice(0, payouts.length);

    mockPrisma.$transaction.mockImplementation(
      (callback: (transaction: typeof mockPrisma) => Promise<unknown>) =>
        callback(mockPrisma),
    );
    mockEarningsService.getUserTotalEarnings.mockImplementation(
      getEarningsSummary,
    );
    mockPrisma.payout.findFirst.mockImplementation(async ({ where }: any) => {
      const payout = payouts.find((candidate) =>
        matchesPayoutWhere(candidate, where),
      );
      if (!payout) return null;
      if (where.include?.wallet) {
        return {
          ...payout,
          wallet: {
            address: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
          },
        };
      }
      return payout;
    });
    mockPrisma.payout.create.mockImplementation(async ({ data }: any) => {
      const payout = {
        ...data,
        id: payouts.length + 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        transactionId: null,
        stellarXdr: null,
      };
      payouts.push(payout);
      return payout;
    });
    mockPrisma.payout.findMany.mockImplementation(async ({ where }: any) =>
      payouts.filter((payout) => matchesPayoutWhere(payout, where)),
    );
    mockPrisma.payout.count.mockImplementation(
      async ({ where }: any) =>
        payouts.filter((payout) => matchesPayoutWhere(payout, where)).length,
    );
    mockPrisma.payout.updateMany.mockImplementation(
      async ({ where, data }: any) => {
        const matching = payouts.filter((payout) =>
          matchesPayoutWhere(payout, where),
        );
        matching.forEach((payout) => Object.assign(payout, data));
        return { count: matching.length };
      },
    );
    mockPrisma.wallet.findFirst.mockResolvedValue({
      id: 11,
      userId: USER_ID,
      address: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
      chain: 'stellar',
      deletedAt: null,
    });
    mockPrisma.payoutMethod.findFirst.mockResolvedValue(null);
    mockStellarService.validateAddress.mockReturnValue({ valid: true });
    mockStellarService.getAccountBalance.mockResolvedValue(200);
    mockFeeService.calculateFee.mockResolvedValue({
      feeAmount: 1,
      feePercentage: 1,
      finalAmount: 119,
    });

    app = await buildApp();
    http = createAuthenticatedRequest(TEST_USER, {
      app: app.getHttpServer(),
    });
  });

  afterEach(async () => {
    if (app) await app.close();
    jest.restoreAllMocks();
  });

  it('creates and persists an authenticated Stellar payout visible in list and detail', async () => {
    const res = await http
      .post('/payouts/request')
      .send({ amount: 120, currency: 'USD', method: 'stellar' })
      .expect(201);

    expect(res.body).toEqual(
      expect.objectContaining({
        id: 1,
        amount: 120,
        currency: 'USD',
        method: 'stellar',
        status: 'approved',
      }),
    );
    expect(payouts).toHaveLength(1);
    expect(payouts[0]).toEqual(
      expect.objectContaining({
        userId: USER_ID,
        walletId: 11,
        amount: 120,
        currency: 'USD',
        method: 'stellar',
        status: 'approved',
      }),
    );

    const list = await http.get('/payouts').expect(200);
    expect(list.body.items).toEqual([
      expect.objectContaining({ id: 1, status: 'approved' }),
    ]);

    const details = await http.get('/payouts/1').expect(200);
    expect(details.body).toEqual(
      expect.objectContaining({
        id: 1,
        amount: 120,
        method: 'stellar',
        status: 'approved',
      }),
    );
  });

  it('trims string fields and transforms numeric payloads for payout requests', async () => {
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

    await http
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

  it('rejects payout requests without authentication', async () => {
    await request(app.getHttpServer())
      .post('/payouts/request')
      .send({ amount: 120, currency: 'USD', method: 'stellar' })
      .expect(401);
  });

  it('validates minimum payout amount', async () => {
    // Request below default min (10)
    await http
      .post('/payouts/request')
      .send({ amount: 5, currency: 'USD', method: 'stellar' })
      .expect(400);
  });

  it('validates insufficient balance', async () => {
    earnings.splice(0, earnings.length, { userId: USER_ID, amount: 20 });

    await http
      .post('/payouts/request')
      .send({ amount: 50, currency: 'USD', method: 'stellar' })
      .expect(400);
  });

  it('rejects an invalid payout method', async () => {
    await http
      .post('/payouts/request')
      .send({ amount: 50, currency: 'USD', method: 'paypal' })
      .expect(400);
    expect(mockPrisma.payout.create).not.toHaveBeenCalled();
  });

  it('rejects unexpected properties on payout request payloads', async () => {
    await http
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

    const res = await http
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
    await http
      .post('/payouts/initiate-stellar')
      .send({ payoutId: 101, amount: 100.00000001 })
      .expect(400);
  });

  it('rejects unexpected properties on initiate-stellar payloads', async () => {
    await http
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
