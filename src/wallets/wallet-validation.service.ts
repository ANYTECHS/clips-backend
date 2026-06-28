import { Injectable, BadRequestException } from '@nestjs/common';
import { StellarService } from '../stellar/stellar.service';
import { SupportedChain } from './chain.constants';

@Injectable()
export class WalletValidationService {
  constructor(private readonly stellarService: StellarService) {}

  validateAddressForChain(address: string, chain: SupportedChain): void {
    switch (chain) {
      case 'stellar':
        this.validateStellarAddress(address);
        break;
      case 'solana':
        this.validateSolanaAddress(address);
        break;
      case 'base':
        this.validateEvmAddress(address);
        break;
    }
  }

  validateStellarAddress(address: string): void {
    const validation = this.stellarService.validateAddress(address);
    if (!validation.valid) {
      throw new BadRequestException('Invalid Stellar address format');
    }
  }

  private validateSolanaAddress(address: string): void {
    // Solana public keys are base58-encoded 32-byte Ed25519 keys (32–44 chars)
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) {
      throw new BadRequestException('Invalid Solana address format');
    }
  }

  private validateEvmAddress(address: string): void {
    // Base (and all EVM chains) use 0x-prefixed 40-character hex addresses
    if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
      throw new BadRequestException('Invalid Base address format');
    }
  }
}
