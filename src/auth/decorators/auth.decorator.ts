import { applyDecorators, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';
import { Roles } from './roles.decorator';

/**
 * Composite decorator that applies JwtAuthGuard.
 * Optionally adds RolesGuard + @Roles when roles are provided.
 */
export const Auth = (...roles: string[]) =>
  roles.length
    ? applyDecorators(UseGuards(JwtAuthGuard, RolesGuard), Roles(...roles))
    : applyDecorators(UseGuards(JwtAuthGuard));
