import { SetMetadata } from '@nestjs/common';

/**
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
