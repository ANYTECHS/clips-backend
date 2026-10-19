import { UseGuards, applyDecorators } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';

/**
 * @Auth() composite decorator.
 *
 * Automatically applies:
 * - JwtAuthGuard for route protection
 * - @ApiBearerAuth() for Swagger documentation
 *
 * Usage on controller classes or individual methods:
 * ```typescript
 * @Controller('clips')
 * @Auth()
 * export class ClipsController { ... }
 * ```
 *
 * This ensures all routes are authenticated and properly documented as requiring
 * a bearer token in the Authorization header.
 */
export const Auth = () =>
  applyDecorators(UseGuards(JwtAuthGuard), ApiBearerAuth('access-token'));
import { applyDecorators, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiUnauthorizedResponse } from '@nestjs/swagger';

/**
 * Auth decorator - marks endpoints as requiring authentication.
 *
 * This is a placeholder decorator for the authentication guard.
 * In a full implementation, this would apply JWT guard and set up
 * proper authentication requirements.
 *
 * @example
 * ```typescript
 * @Auth()
 * @Get('profile')
 * getProfile() {
 *   // Only accessible with valid JWT
 * }
 * ```
 */
export function Auth() {
  return applyDecorators(
    ApiBearerAuth('access-token'),
    ApiUnauthorizedResponse({
      description: 'Unauthorized - Valid JWT required',
      schema: {
        example: {
          statusCode: 401,
          message: 'Unauthorized',
          error: 'Unauthorized',
          requestId: '550e8400-e29b-41d4-a716-446655440000',
        },
      },
    }),
    // In a real implementation:
    // UseGuards(JwtAuthGuard),
  );
}
