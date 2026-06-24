import { Injectable, Logger } from '@nestjs/common';
import StellarSdk from '@stellar/stellar-sdk';

export interface AddressValidationResult {
  valid: boolean;
  message?: string;
}

@Injectable()
export class StellarService {
  private readonly logger = new Logger(StellarService.name);

  readonly network: 'testnet' | 'public';
  readonly rpcUrl: string;
  readonly horizonUrl: string;
  readonly networkPassphrase: string;

  constructor() {
    const raw = (process.env.STELLAR_NETWORK ?? 'testnet').toLowerCase();
    this.network = raw === 'public' ? 'public' : 'testnet';

    if (this.network === 'public') {
      this.rpcUrl = 'https://soroban-rpc.stellar.org';
      this.horizonUrl = 'https://horizon.stellar.org';
      this.networkPassphrase = StellarSdk.Networks.PUBLIC;
    } else {
      this.rpcUrl = 'https://soroban-testnet.stellar.org';
      this.horizonUrl = 'https://horizon-testnet.stellar.org';
      this.networkPassphrase = StellarSdk.Networks.TESTNET;
    }
  }

  isTestnet(): boolean {
    return this.network === 'testnet';
  }

  validateAddress(address: string): AddressValidationResult {
    if (!StellarSdk.StrKey.isValidEd25519PublicKey(address)) {
      return { valid: false, message: 'Invalid Stellar public key format' };
    }
    return { valid: true };
  }

  async fundWithFriendbot(publicKey: string): Promise<void> {
    if (!this.isTestnet()) {
      throw new Error('Friendbot funding is only available on testnet');
    }

    const response = await fetch(
      `https://friendbot.stellar.org?addr=${encodeURIComponent(publicKey)}`,
    );

    if (!response.ok) {
      const message = await response.text();
      this.logger.error(`Friendbot funding failed: ${message}`);
      throw new Error(`Friendbot funding failed: ${message.slice(0, 200)}`);
    }
  }
}
