import { BadRequestException } from '@nestjs/common';
import { PayoutsService } from './payouts.service';
import { FeeService } from './fee.service';

// ── FeeService ────────────────────────────────────────────────────────────────

const mockFeeConfigPrisma = {
  payoutFeeConfig: {
    findFirst: jest.fn(),
  },
};

describe('FeeService', () => {
  let feeService: FeeService;

  beforeEach(() => {
    jest.clearAllMocks();
    feeService = new FeeService(mockFeeConfigPrisma as any);
  });

  it('applies configured percentage fee', async () => {
    mockFeeConfigPrisma.payoutFeeConfig.findFirst.mockResolvedValue({
      feePercentage: 2,
      fixedFee: 0,
      minFee: 0,
      maxFee: null,
    });

    const result = await feeService.calculateFee(100, 'stellar');
    expect(result.feeAmount).toBe(2);
    expect(result.finalAmount).toBe(98);
    expect(result.feePercentage).toBe(2);
  });

  it('applies fixed fee on top of percentage', async () => {
    mockFeeConfigPrisma.payoutFeeConfig.findFirst.mockResolvedValue({
      feePercentage: 1,
      fixedFee: 0.5,
      minFee: 0,
      maxFee: null,
    });

    const result = await feeService.calculateFee(100, 'stellar');
    expect(result.feeAmount).toBe(1.5);
    expect(result.finalAmount).toBe(98.5);
  });

  it('enforces minimum fee', async () => {
    mockFeeConfigPrisma.payoutFeeConfig.findFirst.mockResolvedValue({
      feePercentage: 0.1,
      fixedFee: 0,
      minFee: 2,
      maxFee: null,
    });

    const result = await feeService.calculateFee(100, 'stellar');
    expect(result.feeAmount).toBe(2);
    expect(result.finalAmount).toBe(98);
  });

  it('enforces maximum fee', async () => {
    mockFeeConfigPrisma.payoutFeeConfig.findFirst.mockResolvedValue({
      feePercentage: 10,
      fixedFee: 0,
      minFee: 0,
      maxFee: 5,
    });

    const result = await feeService.calculateFee(100, 'stellar');
    expect(result.feeAmount).toBe(5);
    expect(result.finalAmount).toBe(95);
  });

  it('uses default 1% fee when no config found', async () => {
    mockFeeConfigPrisma.payoutFeeConfig.findFirst.mockResolvedValue(null);

    const result = await feeService.calculateFee(200, 'wire');
    expect(result.feeAmount).toBe(2);
    expect(result.finalAmount).toBe(198);
  });
});

// ── PayoutsService ────────────────────────────────────────────────────────────

describe('PayoutsService requestPayout', () => {
  let service: PayoutsService;

  const prisma = {
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
  };

  const stellarSvc = { horizonUrl: 'https://horizon-testnet.stellar.org', networkPassphrase: 'Test' };
  const receiptSvc = { generateAndSendReceipt: jest.fn() };
  const feeSvc = { calculateFee: jest.fn() };
  const retryQueue = { add: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PayoutsService(
      prisma as any,
      stellarSvc as any,
      receiptSvc as any,
      feeSvc as any,
      retryQueue as any,
    );
    delete process.env.MIN_PAYOUT_USD;
  });

  it('throws BadRequestException when amount is below minimum', async () => {
    prisma.payout.findFirst.mockResolvedValue(null);
    await expect(
      service.requestPayout(1, { amount: 1, method: 'stellar' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('throws BadRequestException when pending payout already exists', async () => {
    prisma.payout.findFirst.mockResolvedValue({ id: 1, status: 'pending' });

    await expect(
      service.requestPayout(1, { amount: 50, method: 'stellar' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('throws BadRequestException when balance is insufficient', async () => {
    prisma.payout.findFirst.mockResolvedValue(null);
    prisma.earning.aggregate.mockResolvedValue({ _sum: { amount: 20 } });
    prisma.payout.aggregate.mockResolvedValue({ _sum: { amount: 0 } });

    await expect(
      service.requestPayout(1, { amount: 50, method: 'stellar' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('creates payout record when request is valid', async () => {
    prisma.payout.findFirst.mockResolvedValue(null);
    prisma.earning.aggregate.mockResolvedValue({ _sum: { amount: 200 } });
    prisma.payout.aggregate.mockResolvedValue({ _sum: { amount: 0 } });
    prisma.wallet.findFirst.mockResolvedValue({ id: 5, address: 'GWALLET', userId: 1 });
    feeSvc.calculateFee.mockResolvedValue({ feeAmount: 1, feePercentage: 1, finalAmount: 99 });
    prisma.payout.create.mockResolvedValue({ id: 10, status: 'pending', amount: 100 });

    const result = await service.requestPayout(1, { amount: 100, method: 'stellar' });

    expect(result.id).toBe(10);
    expect(prisma.payout.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: 1, status: 'pending', amount: 100 }),
      }),
    );
  });

  it('creates payout without walletId for non-stellar method', async () => {
    prisma.payout.findFirst.mockResolvedValue(null);
    prisma.earning.aggregate.mockResolvedValue({ _sum: { amount: 500 } });
    prisma.payout.aggregate.mockResolvedValue({ _sum: { amount: 0 } });
    feeSvc.calculateFee.mockResolvedValue({ feeAmount: 2, feePercentage: 1, finalAmount: 98 });
    prisma.payout.create.mockResolvedValue({ id: 11, status: 'pending', amount: 100 });

    await service.requestPayout(1, { amount: 100, method: 'wire' });

    expect(prisma.wallet.findFirst).not.toHaveBeenCalled();
  });
});
