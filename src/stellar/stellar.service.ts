import { Injectable } from '@nestjs/common';
import { StrKey } from '@stellar/stellar-sdk';

type Network = 'testnet' | 'public';

@Injectable()
export class StellarService {
  readonly network: Network;
  readonly rpcUrl: string;
  readonly horizonUrl: string;
  readonly networkPassphrase: string;

  constructor() {
    const net = (process.env.STELLAR_NETWORK ?? 'testnet') as Network;
    this.network = net;

    if (net === 'public') {
      this.rpcUrl = 'https://soroban-rpc.stellar.org';
      this.horizonUrl = 'https://horizon.stellar.org';
      this.networkPassphrase = 'Public Global Stellar Network ; September 2015';
    } else {
      this.rpcUrl = 'https://soroban-testnet.stellar.org';
      this.horizonUrl = 'https://horizon-testnet.stellar.org';
      this.networkPassphrase = 'Test SDF Network ; September 2015';
    }
  }

  validateAddress(address: string): { valid: boolean; message?: string } {
    const valid = StrKey.isValidEd25519PublicKey(address);
    return valid ? { valid: true } : { valid: false, message: 'Invalid Stellar public key' };
  }
}
