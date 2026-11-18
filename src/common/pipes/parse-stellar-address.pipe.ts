import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';

/**
 * Stellar public keys (G... addresses) are 56-character base32 strings that
 * always begin with 'G'. They encode a 32-byte Ed25519 public key plus a
 * 2-byte checksum using the Stellar base32 alphabet (RFC 4648 without padding,
 * uppercase A-Z and 2-7).
 *
 * This regex matches the character-level structure. Full checksum verification
 * would require the Stellar SDK and is out of scope for a route-parameter pipe.
 */
const STELLAR_ADDRESS_REGEX = /^G[A-Z2-7]{55}$/;

/**
 * Route-parameter pipe for Stellar public key addresses.
 *
 * Rejects the request with HTTP 400 before any database or on-chain query when
 * the raw parameter does not look like a valid Stellar G... address.
 *
 * Usage:
 *   @Param('address', ParseStellarAddressPipe) address: string
 */
@Injectable()
export class ParseStellarAddressPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    const trimmed = (typeof value === 'string' ? value : String(value)).trim();

    if (!STELLAR_ADDRESS_REGEX.test(trimmed)) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'Validation failed (56-character Stellar address starting with G expected)',
        error: 'Bad Request',
      });
    }

    return trimmed;
  }
}
