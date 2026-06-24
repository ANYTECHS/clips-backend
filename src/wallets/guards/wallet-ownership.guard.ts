import {
  Injectable,
  CanActivate,
  ExecutionContext,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class WalletOwnershipGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const userId = request.user?.userId;
    const walletId = request.params.id;

    if (!userId) {
      return false;
    }

    if (!walletId) {
      return true;
    }

    const wallet = await this.prisma.wallet.findUnique({
      where: { id: parseInt(walletId, 10) },
    });

    if (!wallet || wallet.userId !== userId) {
      // Return 404 to avoid leaking existence of wallets belonging to others
      throw new NotFoundException(`Wallet ${walletId} not found`);
    }

    return true;
  }
}
