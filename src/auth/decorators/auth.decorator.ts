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
