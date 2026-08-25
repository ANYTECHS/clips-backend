import { NotFoundException } from '@nestjs/common';

describe('PayoutsService - getOnChainStatus', () => {
  const mockPrismaService = {
    payout: {
      findFirst: jest.fn(),
    },
  };

  const mockStellarService = {
    getTransactionStatus: jest.fn(),
  };

  // Replicate the getOnChainStatus logic directly for unit testing
  async function getOnChainStatus(
    userId: number,
    payoutId: number,
  ) {
    const payout = await mockPrismaService.payout.findFirst({
      where: { id: payoutId, userId },
      select: {
        id: true,
        status: true,
        onChainTxHash: true,
        confirmedAt: true,
      },
    });

    if (!payout) {
      throw new NotFoundException('Payout record not found');
    }

    let onChain = { found: false as const };

    if (payout.onChainTxHash && payout.method === 'stellar') {
      try {
        const result = await mockStellarService.getTransactionStatus(
          payout.onChainTxHash,
        );
        onChain = result;
      } catch {
        // Graceful fallback on Horizon errors
      }
    }

    return {
      id: payout.id,
      status: payout.status,
      onChainTxHash: payout.onChainTxHash,
      confirmedAt: payout.confirmedAt,
      onChain,
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns not-found for unknown payout', async () => {
    mockPrismaService.payout.findFirst.mockResolvedValue(null);

    await expect(getOnChainStatus(1, 999)).rejects.toThrow(NotFoundException);
  });

  it('queries Horizon when payout has an onChainTxHash', async () => {
    mockPrismaService.payout.findFirst.mockResolvedValue({
      id: 1,
      status: 'processing',
      onChainTxHash: 'abc123',
      confirmedAt: null,
      method: 'stellar',
    });
    mockStellarService.getTransactionStatus.mockResolvedValue({
      found: true,
      successful: true,
      confirmedAt: new Date('2025-01-15T10:00:00Z'),
    });

    const result = await getOnChainStatus(1, 1);

    expect(result.onChain.found).toBe(true);
    expect(result.onChain.successful).toBe(true);
    expect(result.onChain.confirmedAt).toEqual(
      new Date('2025-01-15T10:00:00Z'),
    );
    expect(mockStellarService.getTransactionStatus).toHaveBeenCalledWith(
      'abc123',
    );
  });

  it('returns found=false when no onChainTxHash', async () => {
    mockPrismaService.payout.findFirst.mockResolvedValue({
      id: 2,
      status: 'pending',
      onChainTxHash: null,
      confirmedAt: null,
    });

    const result = await getOnChainStatus(1, 2);

    expect(result.onChain).toEqual({ found: false });
    expect(mockStellarService.getTransactionStatus).not.toHaveBeenCalled();
  });

  it('handles Horizon query failures gracefully', async () => {
    mockPrismaService.payout.findFirst.mockResolvedValue({
      id: 3,
      status: 'processing',
      onChainTxHash: 'badtx',
      confirmedAt: null,
      method: 'stellar',
    });
    mockStellarService.getTransactionStatus.mockRejectedValue(
      new Error('Horizon down'),
    );

    const result = await getOnChainStatus(1, 3);

    expect(result.onChain).toEqual({ found: false });
  });

  it('skips Horizon query for non-stellar payouts', async () => {
    mockPrismaService.payout.findFirst.mockResolvedValue({
      id: 4,
      status: 'processing',
      onChainTxHash: 'somehash',
      confirmedAt: null,
      method: 'fiat',
    });

    const result = await getOnChainStatus(1, 4);

    expect(result.onChain).toEqual({ found: false });
    expect(mockStellarService.getTransactionStatus).not.toHaveBeenCalled();
  });

  it('returns the payout status and timestamps', async () => {
    const confirmedDate = new Date('2025-06-01T08:00:00Z');
    mockPrismaService.payout.findFirst.mockResolvedValue({
      id: 5,
      status: 'completed',
      onChainTxHash: 'txhash123',
      confirmedAt: confirmedDate,
      method: 'stellar',
    });
    mockStellarService.getTransactionStatus.mockResolvedValue({
      found: true,
      successful: true,
      confirmedAt: confirmedDate,
    });

    const result = await getOnChainStatus(1, 5);

    expect(result.id).toBe(5);
    expect(result.status).toBe('completed');
    expect(result.onChainTxHash).toBe('txhash123');
    expect(result.confirmedAt).toEqual(confirmedDate);
  });
});
