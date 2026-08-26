import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConnectWalletDto } from './dto/connect-wallet.dto';
import { WalletValidationService } from './wallet-validation.service';
import { DEFAULT_CHAIN, SupportedChain } from './chain.constants';
import { maskAddress } from './wallet.utils';

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

  /**
   * Masks sensitive wallet information before returning to client
   * @param wallet Wallet object from database
   * @returns Wallet with masked address
   */
  private maskWallet(wallet: any): any {
    return {
      ...wallet,
      address: maskAddress(wallet.address),
    };
  }

  async disconnect(
    walletId: number,
    userId: number,
  ): Promise<DisconnectResult> {
    const wallet = await this.prisma.wallet.findUnique({
      where: { id: walletId },
    });

    if (!wallet || wallet.userId !== userId) {
      throw new NotFoundException(`Wallet ${walletId} not found`);
    }

    if (wallet.deletedAt !== null) {
      throw new ConflictException('Wallet is already disconnected');
    }

    // Check for any open payouts tied to this specific wallet (excluding
    // soft-deleted payout records so that historical data does not block
    // future disconnects).
    const pendingPayout = await this.prisma.payout.findFirst({
      where: {
        walletId,
        status: { in: ['pending', 'pending_approval', 'approved', 'processing'] },
        deletedAt: null,
      },
      select: { id: true, status: true },
    });

    if (pendingPayout) {
      throw new ConflictException(
        `Cannot disconnect wallet: payout ${pendingPayout.id} is still ${pendingPayout.status}`,
      );
    }

    const activeNft = await this.prisma.clip.findFirst({
      where: {
        video: {
          userId,
        },
        OR: [
          { nftStatus: 'minting' },
          { nftStatus: 'minted' },
          { mintAddress: { not: null } },
        ],
      },
      select: {
        id: true,
      },
    });

    if (activeNft) {
      throw new ConflictException(
        'Cannot disconnect wallet: active NFTs are still associated with this account',
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
    const chain = (dto.chain ?? DEFAULT_CHAIN) as SupportedChain;

    this.walletValidationService.validateAddressForChain(dto.address, chain);

    // Signature verification is only supported for Stellar wallets today;
    // Solana and Base/EVM wallets will need their own verification flow.
    if (chain === 'stellar') {
      this.walletValidationService.verifySignatureOwnership(
        dto.publicKey,
        dto.signature,
        dto.signedMessage,
      );
    }

    const wallet = await this.prisma.wallet.upsert({
      where: {
        address_chain: {
          address: dto.address,
          chain,
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
        chain,
        type: dto.type,
      },
    });

    return this.maskWallet(wallet);
  }

  async listWallets(userId: number): Promise<any[]> {
    const wallets = await this.prisma.wallet.findMany({
      where: { userId, deletedAt: null },
      orderBy: { connectedAt: 'desc' },
    });
    return wallets.map((w) => this.maskWallet(w));
  }

  async getWalletById(walletId: number, userId: number): Promise<any> {
    const wallet = await this.prisma.wallet.findFirst({
      where: { id: walletId, userId, deletedAt: null },
    });

    if (!wallet) {
      throw new NotFoundException(`Wallet ${walletId} not found`);
    }

    return this.maskWallet(wallet);
  }
}
