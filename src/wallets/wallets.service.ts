import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StellarService } from '../stellar/stellar.service';

export interface ConnectWalletDto {
  address: string;
  chain: string;
  type: 'freighter' | 'lobstr' | 'albedo';
}

@Injectable()
export class WalletsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stellarService: StellarService,
  ) {}

  async connect(userId: number, dto: ConnectWalletDto) {
    const validation = this.stellarService.validateAddress(dto.address);
    if (!validation.valid) {
      throw new BadRequestException(
        validation.message ?? 'Invalid wallet address',
      );
    }

    return this.prisma.wallet.upsert({
      where: {
        address_chain: {
          address: dto.address,
          chain: dto.chain,
        },
      },
      update: {
        userId,
        type: dto.type,
        deletedAt: null,
      },
      create: {
        userId,
        address: dto.address,
        chain: dto.chain,
        type: dto.type,
      },
    });
  }

  async disconnect(walletId: number, userId: number) {
    const wallet = await this.prisma.wallet.findUnique({
      where: { id: walletId },
    });

    if (!wallet || wallet.userId !== userId) {
      throw new NotFoundException('Wallet not found');
    }

    if (wallet.deletedAt) {
      throw new ConflictException('Wallet is already disconnected');
    }

    const pendingPayout = await this.prisma.payout.findFirst({
      where: {
        walletId,
        status: 'pending',
      },
    });

    if (pendingPayout) {
      throw new ConflictException(
        'Cannot disconnect wallet with pending payouts',
      );
    }

    await this.prisma.wallet.update({
      where: { id: walletId },
      data: { deletedAt: new Date() },
    });

    return {
      message: 'Wallet disconnected successfully',
      walletId,
    };
  }
}
