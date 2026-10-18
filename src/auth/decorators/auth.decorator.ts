import { applyDecorators, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiUnauthorizedResponse, ApiForbiddenResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';
import { Roles } from './roles.decorator';

/**
 * Composite decorator that applies JwtAuthGuard + Swagger @ApiBearerAuth().
 * Optionally adds RolesGuard + @Roles when roles are provided.
 *
 * Usage:
 *   @Auth()                   — JWT-only, any authenticated user
 *   @Auth('admin')            — JWT + role check for 'admin'
 *   @Auth('admin', 'editor')  — JWT + role check for 'admin' OR 'editor'
 */
export const Auth = (...roles: string[]) =>
  roles.length
    ? applyDecorators(
        UseGuards(JwtAuthGuard, RolesGuard),
        Roles(...roles),
        ApiBearerAuth('access-token'),
        ApiUnauthorizedResponse({ description: 'Unauthorized — JWT token required' }),
        ApiForbiddenResponse({ description: `Forbidden — required role(s): ${roles.join(', ')}` }),
      )
    : applyDecorators(
        UseGuards(JwtAuthGuard),
        ApiBearerAuth('access-token'),
        ApiUnauthorizedResponse({ description: 'Unauthorized — JWT token required' }),
      );
