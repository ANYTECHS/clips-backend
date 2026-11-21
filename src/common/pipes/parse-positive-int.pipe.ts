import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';

/**
 * Route-parameter pipe for integer database identifiers.
 *
 * Rejects the request with HTTP 400 before any database query is made when:
 *   - the raw string is not a valid integer representation
 *   - the parsed value is not a finite positive integer (≥ 1)
 *
 * Usage:
 *   @Param('id', ParsePositiveIntPipe) id: number
 *
 * Drop-in replacement for the built-in ParseIntPipe that:
 *   - produces the project-standard `{ statusCode, message, error }` body
 *   - rejects zero and negative values (all autoincrement IDs start at 1)
 */
@Injectable()
export class ParsePositiveIntPipe implements PipeTransform<string, number> {
  transform(value: string): number {
    const trimmed = typeof value === 'string' ? value.trim() : String(value);

    if (!/^-?\d+$/.test(trimmed)) {
      throw new BadRequestException({
        statusCode: 400,
        message: `Validation failed (positive integer expected)`,
        error: 'Bad Request',
      });
    }

    const parsed = parseInt(trimmed, 10);

    if (!Number.isFinite(parsed) || parsed < 1) {
      throw new BadRequestException({
        statusCode: 400,
        message: `Validation failed (positive integer expected)`,
        error: 'Bad Request',
      });
    }

    return parsed;
  }
}
