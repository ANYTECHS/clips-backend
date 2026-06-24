import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StellarService } from '../stellar/stellar.service';

interface ConnectWalletDto {
  address: string;
  chain: string;
  type: string;
}

@Injectable()
export class WalletsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stellar: StellarService,
  ) {}

  async connect(userId: number, dto: ConnectWalletDto) {
    const check = this.stellar.validateAddress(dto.address);
    if (!check.valid) {
      throw new BadRequestException(`Invalid Stellar address: ${check.message}`);
    }

    return this.prisma.wallet.upsert({
      where: { address_chain: { address: dto.address, chain: dto.chain } },
      create: { userId, address: dto.address, chain: dto.chain, type: dto.type },
      update: { userId, type: dto.type, deletedAt: null },
    });
  }

  async disconnect(walletId: number, userId: number) {
    const wallet = await this.prisma.wallet.findUnique({ where: { id: walletId } });

    if (!wallet || wallet.userId !== userId) {
      throw new NotFoundException('Wallet not found');
    }

    if (wallet.deletedAt) {
      throw new ConflictException('Wallet is already disconnected');
    }

    const pendingPayout = await this.prisma.payout.findFirst({
      where: { walletId, status: 'pending' },
    });

    if (pendingPayout) {
      throw new ConflictException('Cannot disconnect wallet with pending payouts');
    }

    await this.prisma.wallet.update({
      where: { id: walletId },
      data: { deletedAt: new Date() },
    });

    return { message: 'Wallet disconnected successfully', walletId };
  }
}
