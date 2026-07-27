import { Injectable, BadRequestException } from '@nestjs/common';
import { Keypair } from '@stellar/stellar-sdk';
import { StellarService } from '../stellar/stellar.service';
import { SupportedChain } from './chain.constants';

@Injectable()
export class WalletValidationService {
  constructor(private readonly stellarService: StellarService) {}

  /**
   * Verifies that the caller controls the private key corresponding to
   * `publicKey` by checking the Ed25519 signature of `signedMessage`.
   *
   * Uses `Keypair.fromPublicKey(publicKey).verify(messageBytes, signatureBytes)`
   * from @stellar/stellar-sdk so no secret key is ever required.
   *
   * @throws BadRequestException when the signature is invalid or the publicKey
   *   is not a valid Stellar key.
   */
  verifySignatureOwnership(
    publicKey: string,
    signature: string,
    signedMessage: string,
  ): void {
    let keypair: Keypair;
    try {
      keypair = Keypair.fromPublicKey(publicKey);
    } catch {
      throw new BadRequestException(
        'Invalid Stellar public key for signature verification',
      );
    }

    let signatureBytes: Buffer;
    try {
      signatureBytes = Buffer.from(signature, 'base64');
    } catch {
      throw new BadRequestException('Signature must be valid base64');
    }

    const messageBytes = Buffer.from(signedMessage, 'utf8');

    const valid = keypair.verify(messageBytes, signatureBytes);
    if (!valid) {
      throw new BadRequestException(
        'Signature verification failed: signature does not match the provided public key',
      );
    }
  }

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
