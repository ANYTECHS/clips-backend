import { Injectable } from '@nestjs/common';
import { ConnectWalletDto } from './dto/connect-wallet.dto';
import {
  WalletManagementService,
  DisconnectResult,
} from './wallet-management.service';

export type { DisconnectResult };

@Injectable()
export class WalletsService {
  constructor(
    private readonly walletManagementService: WalletManagementService,
  ) {}

  disconnect(walletId: number, userId: number): Promise<DisconnectResult> {
    return this.walletManagementService.disconnect(walletId, userId);
  }

  connect(userId: number, dto: ConnectWalletDto) {
    return this.walletManagementService.connect(userId, dto);
  }

  listWallets(userId: number) {
    return this.walletManagementService.listWallets(userId);
  }

  findWallet(walletId: number, userId: number) {
    return this.walletManagementService.findWallet(walletId, userId);
  getWalletById(walletId: number, userId: number) {
    return this.walletManagementService.getWalletById(walletId, userId);
  }
}
