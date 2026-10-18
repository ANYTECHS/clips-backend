import { UseGuards, applyDecorators } from '@nestjs/common';
import { ApiBearerAuth, ApiForbiddenResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { AdminGuard } from '../../common/guards/admin.guard';

/**
 * @Admin() composite decorator.
 *
 * Applies admin-only access control and Swagger documentation.
 * Automatically applies:
 * - JwtAuthGuard for authentication
 * - AdminGuard for admin authorization check
 * - @ApiBearerAuth() for Swagger documentation
 * - @ApiForbiddenResponse() indicating admin-only access
 *
 * Usage on controller classes or individual methods:
 * ```typescript
 * @Controller('admin')
 * @Admin()
 * export class AdminController { ... }
 * ```
 *
 * Requires `x-admin-secret` header matching ADMIN_SECRET environment variable.
 */
export const Admin = () =>
  applyDecorators(
    UseGuards(JwtAuthGuard, AdminGuard),
    ApiBearerAuth('access-token'),
    ApiForbiddenResponse({
      description:
        'Forbidden — admin access required. Verify x-admin-secret header matches ADMIN_SECRET.',
    }),
  );
