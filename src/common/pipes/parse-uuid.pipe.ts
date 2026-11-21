import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';

/**
 * UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
 * where x is any hex digit and y is 8, 9, a, or b.
 *
 * This pipe accepts any UUID version (v1–v5) for maximum compatibility,
 * matching the RFC 4122 canonical 8-4-4-4-12 hex format.
 */
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Route-parameter pipe for UUID identifiers (RFC 4122, all versions).
 *
 * Rejects the request with HTTP 400 before any database query is made when
 * the raw parameter is not a valid UUID (8-4-4-4-12 hex groups).
 *
 * Usage:
 *   @Param('id', ParseUuidPipe) id: string
 */
@Injectable()
export class ParseUuidPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    const trimmed = (typeof value === 'string' ? value : String(value))
      .trim()
      .toLowerCase();

    if (!UUID_REGEX.test(trimmed)) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'Validation failed (UUID expected)',
        error: 'Bad Request',
      });
    }

    return trimmed;
  }
}
