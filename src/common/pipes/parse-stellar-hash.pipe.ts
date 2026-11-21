import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';

/**
 * Stellar / Soroban transaction hashes are 64 lowercase hexadecimal characters
 * (SHA-256 of the transaction XDR envelope, encoded as hex).
 */
const STELLAR_HASH_REGEX = /^[0-9a-f]{64}$/;

/**
 * Route-parameter pipe for Stellar / Soroban transaction hashes.
 *
 * Rejects the request with HTTP 400 before any database or Horizon lookup is
 * made when the raw parameter is not a 64-character lowercase hex string.
 *
 * Usage:
 *   @Param('hash', ParseStellarHashPipe) hash: string
 */
@Injectable()
export class ParseStellarHashPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    const trimmed = (typeof value === 'string' ? value : String(value)).trim().toLowerCase();

    if (!STELLAR_HASH_REGEX.test(trimmed)) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'Validation failed (64-character hex transaction hash expected)',
        error: 'Bad Request',
      });
    }

    return trimmed;
  }
}
