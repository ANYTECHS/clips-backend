import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StellarService, WalletBalanceResult } from '../stellar/stellar.service';

@Injectable()
export class WalletBalanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stellarService: StellarService,
  ) {}

  async getBalance(walletId: number, userId: number): Promise<WalletBalanceResult> {
    const wallet = await this.prisma.wallet.findUnique({
      where: { id: walletId },
      select: { id: true, userId: true, address: true, deletedAt: true },
    });

    if (!wallet || wallet.userId !== userId || wallet.deletedAt !== null) {
      throw new NotFoundException(`Wallet ${walletId} not found`);
    }

    return this.stellarService.getWalletBalance(wallet.address);
  }
}
