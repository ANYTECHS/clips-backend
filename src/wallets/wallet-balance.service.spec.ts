import { NotFoundException } from '@nestjs/common';
import { WalletBalanceService } from './wallet-balance.service';
import { PrismaService } from '../prisma/prisma.service';
import { StellarService } from '../stellar/stellar.service';

describe('WalletBalanceService', () => {
  const prisma = {
    wallet: {
      findUnique: jest.fn(),
    },
  };
  const stellarService = {
    getWalletBalance: jest.fn(),
  };
  let service: WalletBalanceService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new WalletBalanceService(
      prisma as unknown as PrismaService,
      stellarService as unknown as StellarService,
    );
  });

  it('returns the balance and warning from the Stellar service for an owned wallet', async () => {
    const wallet = {
      id: 3,
      userId: 12,
      address: 'GABC',
      deletedAt: null,
    };
    const balance = { balance: 1.5, warning: true };
    prisma.wallet.findUnique.mockResolvedValue(wallet);
    stellarService.getWalletBalance.mockResolvedValue(balance);

    await expect(service.getBalance(3, 12)).resolves.toEqual(balance);
    expect(prisma.wallet.findUnique).toHaveBeenCalledWith({
      where: { id: 3 },
      select: { id: true, userId: true, address: true, deletedAt: true },
    });
    expect(stellarService.getWalletBalance).toHaveBeenCalledWith('GABC');
  });

  it.each([
    ['missing', null, 12],
    [
      'owned by another user',
      { id: 3, userId: 13, address: 'GABC', deletedAt: null },
      12,
    ],
    [
      'soft-deleted',
      { id: 3, userId: 12, address: 'GABC', deletedAt: new Date() },
      12,
    ],
  ])(
    'does not fetch Horizon for a %s wallet',
    async (_case, wallet, userId) => {
      prisma.wallet.findUnique.mockResolvedValue(wallet);

      await expect(service.getBalance(3, userId)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(stellarService.getWalletBalance).not.toHaveBeenCalled();
    },
  );
});
