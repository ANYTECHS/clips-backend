import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConnectWalletDto } from './dto/connect-wallet.dto';
import { WalletValidationService } from './wallet-validation.service';

export interface DisconnectResult {
  message: string;
  walletId: number;
}

@Injectable()
export class WalletManagementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly walletValidationService: WalletValidationService,
  ) {}

  async disconnect(walletId: number, userId: number): Promise<DisconnectResult> {
    const wallet = await this.prisma.wallet.findUnique({
      where: { id: walletId },
    });

    if (!wallet || wallet.userId !== userId) {
      throw new NotFoundException(`Wallet ${walletId} not found`);
    }

    if (wallet.deletedAt !== null) {
      throw new ConflictException('Wallet is already disconnected');
    }

    const pendingPayout = await this.prisma.payout.findFirst({
      where: { walletId, status: 'pending' },
    });

    if (pendingPayout) {
      throw new ConflictException(
        'Cannot disconnect wallet: there are pending payouts attached to it',
      );
    }

    await this.prisma.wallet.update({
      where: { id: walletId },
      data: { deletedAt: new Date(), updatedAt: new Date() },
    });

    return {
      message: 'Wallet disconnected successfully',
      walletId,
    };
  }

  async connect(userId: number, dto: ConnectWalletDto) {
    this.walletValidationService.validateStellarAddress(dto.address);

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
        updatedAt: new Date(),
      },
      create: {
        userId,
        address: dto.address,
        chain: dto.chain,
        type: dto.type,
      },
    });
  }
}
