import { SetMetadata } from '@nestjs/common';

/**
 * @Public() decorator marks a route as public (no authentication required).
 * Used on endpoints like /auth/login, /auth/signup, /auth/forgot-password.
 * When applied, the JwtAuthGuard is bypassed.
 */
export const Public = () => SetMetadata('isPublic', true);
 * Public decorator - marks endpoints as not requiring authentication.
 *
 * Used to explicitly mark endpoints as public when a global auth guard is in place.
 *
 * @example
 * ```typescript
 * @Public()
 * @Get('health')
 * healthCheck() {
 *   // Accessible without authentication
 * }
 * ```
 */
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
