import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';

/**
 * CUID format produced by Prisma's `@default(cuid())`.
 *
 * CUIDs are prefixed with `c` followed by 24 lowercase alphanumeric characters,
 * giving a total length of 25 characters.
 *
 * Examples in this codebase: StellarPaymentIntent.id, BlockchainEvent.id
 */
const CUID_REGEX = /^c[0-9a-z]{24}$/;

/**
 * Route-parameter pipe for CUID database identifiers.
 *
 * Rejects the request with HTTP 400 before any database query is made when
 * the raw parameter does not match CUID format.
 *
 * Usage:
 *   @Param('id', ParseCuidPipe) id: string
 */
@Injectable()
export class ParseCuidPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    const trimmed = typeof value === 'string' ? value.trim() : String(value);

    if (!CUID_REGEX.test(trimmed)) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'Validation failed (CUID expected)',
        error: 'Bad Request',
      });
    }

    return trimmed;
  }
}
