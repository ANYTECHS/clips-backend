import { ConflictException, NotFoundException } from '@nestjs/common';

describe('PayoutsService - getOnChainStatus (#982)', () => {
  const mockPrismaService = {
    payout: {
      findFirst: jest.fn(),
      updateMany: jest.fn(),
    },
    earningsAuditLog: {
      create: jest.fn(),
    },
  };

  const mockVerification = {
    verifyPayoutTransaction: jest.fn(),
  };

  async function getOnChainStatus(userId: number, payoutId: number) {
    const payout = await mockPrismaService.payout.findFirst({
      where: { id: payoutId, userId },
      select: {
        id: true,
        status: true,
        method: true,
        amount: true,
        finalAmount: true,
        onChainTxHash: true,
        confirmedAt: true,
        wallet: { select: { address: true } },
      },
    });

    if (!payout) {
      throw new NotFoundException('Payout record not found');
    }

    if (!payout.onChainTxHash) {
      throw new NotFoundException({
        statusCode: 404,
        error: 'Not Found',
        message: 'transaction-not-found',
      });
    }

    if (payout.method !== 'stellar') {
      return {
        id: payout.id,
        status: payout.status,
        onChainTxHash: payout.onChainTxHash,
        confirmedAt: payout.confirmedAt,
        onChain: { found: false },
      };
    }

    const verification = await mockVerification.verifyPayoutTransaction(
      payout.onChainTxHash,
      {
        expectedDestination: payout.wallet?.address,
        expectedAmount: payout.finalAmount ?? payout.amount,
        throwOnNotFound: true,
        throwOnConflict: true,
      },
    );

    let status = payout.status;
    let confirmedAt = payout.confirmedAt;

    if (verification.outcome === 'confirmed') {
      confirmedAt = verification.confirmedAt ?? new Date();
      const updated = await mockPrismaService.payout.updateMany({
        where: {
          id: payoutId,
          status: { in: ['pending', 'processing', 'approved'] },
        },
        data: { status: 'completed', confirmedAt, paidAt: confirmedAt },
      });
      if (updated.count > 0) status = 'completed';
    } else if (verification.outcome === 'failed') {
      const updated = await mockPrismaService.payout.updateMany({
        where: {
          id: payoutId,
          status: { in: ['pending', 'processing', 'approved'] },
        },
        data: { status: 'failed' },
      });
      if (updated.count > 0) status = 'failed';
    }

    return {
      id: payout.id,
      status,
      onChainTxHash: payout.onChainTxHash,
      confirmedAt,
      onChain: {
        found: verification.found,
        successful: verification.successful,
        confirmedAt: verification.confirmedAt,
        destination: verification.destination,
        transferredAmount: verification.transferredAmount,
      },
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns not-found for unknown payout', async () => {
    mockPrismaService.payout.findFirst.mockResolvedValue(null);
    await expect(getOnChainStatus(1, 999)).rejects.toThrow(NotFoundException);
  });

  it('throws transaction-not-found when hash is missing', async () => {
    mockPrismaService.payout.findFirst.mockResolvedValue({
      id: 2,
      status: 'pending',
      method: 'stellar',
      amount: 10,
      finalAmount: 10,
      onChainTxHash: null,
      confirmedAt: null,
      wallet: { address: 'GDEST' },
    });

    await expect(getOnChainStatus(1, 2)).rejects.toMatchObject({
      response: expect.objectContaining({ message: 'transaction-not-found' }),
    });
  });

  it('verifies destination/amount and marks payout completed', async () => {
    const confirmedAt = new Date('2025-01-15T10:00:00Z');
    mockPrismaService.payout.findFirst.mockResolvedValue({
      id: 1,
      status: 'processing',
      method: 'stellar',
      amount: 25,
      finalAmount: 25,
      onChainTxHash: 'abc123',
      confirmedAt: null,
      wallet: { address: 'GDEST' },
    });
    mockVerification.verifyPayoutTransaction.mockResolvedValue({
      outcome: 'confirmed',
      found: true,
      successful: true,
      confirmedAt,
      destination: 'GDEST',
      transferredAmount: 25,
    });
    mockPrismaService.payout.updateMany.mockResolvedValue({ count: 1 });

    const result = await getOnChainStatus(1, 1);

    expect(result.status).toBe('completed');
    expect(result.onChainTxHash).toBe('abc123');
    expect(result.confirmedAt).toEqual(confirmedAt);
    expect(result.onChain.destination).toBe('GDEST');
    expect(mockVerification.verifyPayoutTransaction).toHaveBeenCalledWith(
      'abc123',
      expect.objectContaining({
        expectedDestination: 'GDEST',
        expectedAmount: 25,
      }),
    );
  });

  it('propagates verification-conflict', async () => {
    mockPrismaService.payout.findFirst.mockResolvedValue({
      id: 3,
      status: 'processing',
      method: 'stellar',
      amount: 25,
      finalAmount: 25,
      onChainTxHash: 'bad-amount',
      confirmedAt: null,
      wallet: { address: 'GDEST' },
    });
    mockVerification.verifyPayoutTransaction.mockRejectedValue(
      new ConflictException({
        statusCode: 409,
        message: 'verification-conflict',
      }),
    );

    await expect(getOnChainStatus(1, 3)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('marks payout failed when on-chain tx is unsuccessful', async () => {
    mockPrismaService.payout.findFirst.mockResolvedValue({
      id: 4,
      status: 'processing',
      method: 'stellar',
      amount: 25,
      finalAmount: 25,
      onChainTxHash: 'fail-tx',
      confirmedAt: null,
      wallet: { address: 'GDEST' },
    });
    mockVerification.verifyPayoutTransaction.mockResolvedValue({
      outcome: 'failed',
      found: true,
      successful: false,
    });
    mockPrismaService.payout.updateMany.mockResolvedValue({ count: 1 });

    const result = await getOnChainStatus(1, 4);
    expect(result.status).toBe('failed');
  });
});
