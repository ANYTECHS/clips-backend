import { Injectable } from '@nestjs/common';
import { ConnectWalletDto } from './dto/connect-wallet.dto';
import {
  WalletManagementService,
  DisconnectResult,
} from './wallet-management.service';
import { maskAddress } from './wallet.utils';

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

  getWalletById(walletId: number, userId: number) {
    return this.walletManagementService.getWalletById(walletId, userId);
  }

  /**
   * Partially masks a wallet address for display (Issue #763).
   *
   * Exposed here so callers outside the wallets module can render an address
   * the same way `listWallets` / `getWalletById` / `connect` already do,
   * instead of re-implementing the format. Delegates to the shared
   * {@link maskAddress} helper so there is a single masking implementation.
   */
  maskAddress(address: string): string {
    return maskAddress(address);
  }
}
