import { SetMetadata } from '@nestjs/common';

/**
 * @Public() decorator marks a route as public (no authentication required).
 * Used on endpoints like /auth/login, /auth/signup, /auth/forgot-password.
 * When applied, the JwtAuthGuard is bypassed.
 */
export const Public = () => SetMetadata('isPublic', true);
