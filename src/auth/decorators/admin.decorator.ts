import { SetMetadata } from '@nestjs/common';

/**
 * Admin decorator - marks endpoints as requiring admin role.
 *
 * Used in conjunction with @Auth() decorator to require admin privileges.
 *
 * @example
 * ```typescript
 * @Auth()
 * @Admin()
 * @Get('admin/users')
 * getAllUsers() {
 *   // Only accessible with valid JWT and admin role
 * }
 * ```
 */
export const Admin = () => SetMetadata('admin', true);
