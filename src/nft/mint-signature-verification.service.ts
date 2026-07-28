import {
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { StrKey } from '@stellar/stellar-sdk';
import * as crypto from 'crypto';

/**
 * The canonical challenge message template that the frontend wallet must sign.
 *
 * Format: "ClipCash mint authorization for clip <clipId> by <walletAddress>"
 *
 * The message is deterministic so both client and server can reproduce it
 * without a round-trip challenge/nonce exchange.  For production use-cases
 * that require replay protection, extend this with a short-lived nonce stored
 * in Redis (recommended before mainnet launch).
 */
export function buildMintChallenge(clipId: number, walletAddress: string): string {
  return `ClipCash mint authorization for clip ${clipId} by ${walletAddress}`;
}

/**
 * MintSignatureVerificationService
 *
 * Verifies that a Stellar wallet owner has signed the canonical mint
 * challenge message, proving they control the private key for the address
 * they are requesting to mint with.
 *
 * Stellar uses Ed25519 keypairs.  The signature produced by Freighter /
 * Albedo is a raw Ed25519 signature over the UTF-8 message bytes, returned
 * as a hex or base64 string.  Both encodings are accepted here.
 */
@Injectable()
export class MintSignatureVerificationService {
  private readonly logger = new Logger(MintSignatureVerificationService.name);

  /**
   * Verify that `walletAddress` signed the canonical mint-authorization
   * challenge for `clipId`.
   *
   * @param clipId       - The clip being authorized for minting
   * @param walletAddress - Stellar public key (G...) that should have signed
   * @param signature     - Ed25519 signature as hex or base64 string
   * @throws UnauthorizedException when signature is invalid or cannot be verified
   */
  verify(clipId: number, walletAddress: string, signature: string): void {
    // 1. Validate the Stellar address
    if (!StrKey.isValidEd25519PublicKey(walletAddress)) {
      throw new UnauthorizedException(
        `Invalid Stellar wallet address: ${walletAddress}`,
      );
    }

    // 2. Decode the raw public key bytes from the Stellar address
    let publicKeyBytes: Buffer;
    try {
      publicKeyBytes = Buffer.from(StrKey.decodeEd25519PublicKey(walletAddress));
    } catch {
      throw new UnauthorizedException(
        'Failed to decode Stellar public key',
      );
    }

    // 3. Build the canonical challenge message
    const challenge = buildMintChallenge(clipId, walletAddress);
    const messageBytes = Buffer.from(challenge, 'utf8');

    // 4. Decode the signature (support both hex and base64)
    let sigBytes: Buffer;
    try {
      if (/^[0-9a-fA-F]{128}$/.test(signature)) {
        // 64-byte Ed25519 signature as 128-char hex string
        sigBytes = Buffer.from(signature, 'hex');
      } else {
        // Assume base64 (standard or URL-safe)
        sigBytes = Buffer.from(
          signature.replace(/-/g, '+').replace(/_/g, '/'),
          'base64',
        );
      }
    } catch {
      throw new UnauthorizedException('Cannot decode signature bytes');
    }

    if (sigBytes.length !== 64) {
      throw new UnauthorizedException(
        `Invalid signature length: expected 64 bytes, got ${sigBytes.length}`,
      );
    }

    // 5. Verify Ed25519 signature using Node.js built-in crypto
    try {
      const publicKey = crypto.createPublicKey({
        key: Buffer.concat([
          // Ed25519 SubjectPublicKeyInfo prefix (RFC 8410)
          Buffer.from('302a300506032b6570032100', 'hex'),
          publicKeyBytes,
        ]),
        format: 'der',
        type: 'spki',
      });

      const valid = crypto.verify(
        null, // Ed25519 does not use a hash algorithm parameter
        messageBytes,
        publicKey,
        sigBytes,
      );

      if (!valid) {
        this.logger.warn(
          `Mint signature verification failed for wallet=${walletAddress} clipId=${clipId}`,
        );
        throw new UnauthorizedException(
          'Mint signature is invalid — wallet authorization failed',
        );
      }
    } catch (err) {
      if (err instanceof UnauthorizedException) {
        throw err;
      }
      // crypto.verify can throw on malformed key material
      this.logger.error(
        `Signature verification error for wallet=${walletAddress}: ${(err as Error).message}`,
      );
      throw new UnauthorizedException(
        'Signature verification failed: malformed key or signature',
      );
    }

    this.logger.log(
      `Mint signature verified for clipId=${clipId}, wallet=${walletAddress}`,
    );
  }
}
