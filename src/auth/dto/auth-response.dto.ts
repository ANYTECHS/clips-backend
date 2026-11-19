import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Authentication response containing JWT tokens.
 *
 * **Security Notice:**
 * - `accessToken` and `refreshToken` are JWT Bearer tokens (not encrypted in response)
 * - These tokens themselves contain sensitive claims and must be treated as secrets
 * - Never log these tokens
 * - Store access token in memory only (or secure httpOnly cookie)
 * - Store refresh token securely (secure httpOnly cookie recommended)
 * - Tokens are signed with `JWT_SECRET` and verified on every protected request
 *
 * **Encryption Note:**
 * While the DTO itself returns plaintext tokens (as they must be for client use),
 * the tokens are JSON Web Tokens with HMAC-SHA256 signatures. The tokens contain
 * encrypted or sensitive information internally and must be protected accordingly.
 */
export class TokenResponseDto {
  @ApiProperty({
    description:
      'JWT access token for Bearer authentication. ' +
      'Include in Authorization header: `Authorization: Bearer <accessToken>`. ' +
      'Expires in JWT_EXPIRES seconds (default 3600s). ' +
      'Contains claims: sub (userId), email, emailVerified.',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOjEsImVtYWlsIjoidXNlckBleGFtcGxlLmNvbSIsImVtYWlsVmVyaWZpZWQiOnRydWUsImlhdCI6MTY5MzM2MDAwMCwiZXhwIjoxNjkzMzYzNjAwfQ.abc123...',
  })
  accessToken: string;

  @ApiPropertyOptional({
    description:
      'JWT refresh token for obtaining a new access token. ' +
      'Use POST /auth/refresh with this token to get a new accessToken. ' +
      'Recommended: store in secure httpOnly cookie only. ' +
      'Expires in JWT_REFRESH_EXPIRES seconds (if configured).',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOjEsInR5cCI6InJlZnJlc2giLCJpYXQiOjE2OTMzNjAwMDAsImV4cCI6MTY5Mzk2NDgwMH0.xyz789...',
  })
  refreshToken?: string;

  @ApiPropertyOptional({
    description:
      'CSRF protection token. Include in X-CSRF-Token header for ' +
      'state-changing requests (POST, PUT, PATCH, DELETE) authenticated via httpOnly cookie. ' +
      'Should match the _csrf cookie value. ' +
      'Not needed when using Authorization: Bearer authentication.',
    example: 'abc123def456ghi789jkl',
  })
  csrfToken?: string;
}

/**
 * Login request body.
 */
export class LoginRequestDto {
  @ApiProperty({
    description: 'Email address (used as unique identifier)',
import { ApiProperty, ApiExtraModels } from '@nestjs/swagger';
import { DeviceInfoDto } from './device-info.dto';

/**
 * Successful authentication response.
 * Includes access token, refresh token, user info, and device information.
 */
@ApiExtraModels(DeviceInfoDto)
export class AuthResponseDto {
  @ApiProperty({
    description: 'JWT access token for API requests',
    example:
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOjEsImVtYWlsIjoiay4uLiIsImVtYWlsVmVyaWZpZWQiOnRydWUsImlhdCI6MTcxMDI3MTIwMCwiZXhwIjoxNzEwMjc0ODAwfQ...',
  })
  accessToken: string;

  @ApiProperty({
    description: 'Refresh token for obtaining a new access token',
    example: 'refresh_token_opaque_value_32bytes',
  })
  refreshToken: string;

  @ApiProperty({
    description: 'User ID',
    example: 42,
  })
  userId: number;

  @ApiProperty({
    description: 'User email address',
    example: 'user@example.com',
  })
  email: string;

  @ApiProperty({
    description: 'Password (bcrypt hashed server-side)',
    example: 'SecurePassword123!',
  })
  password: string;
}

/**
 * Logout request body (typically empty, but may include refresh token for revocation).
 */
export class LogoutRequestDto {
  @ApiPropertyOptional({
    description:
      'Refresh token to revoke (optional). ' +
      'If provided, the token is blacklisted to prevent further use. ' +
      'The access token in the Authorization header is also invalidated.',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  refreshToken?: string;
}

/**
 * Logout response.
 */
export class LogoutResponseDto {
  @ApiProperty({
    description: 'Logout successful message',
    example: 'Logged out successfully',
  })
  message: string;

  @ApiPropertyOptional({
    description: 'Timestamp of logout',
    example: '2026-08-29T16:50:25.156Z',
  })
  timestamp?: string;
}

/**
 * Refresh token request.
 */
export class RefreshTokenRequestDto {
  @ApiPropertyOptional({
    description:
      'Refresh token (can be sent as JWT in body, or in secure httpOnly cookie). ' +
      'If cookie is present, this field is optional.',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  refreshToken?: string;
}

/**
 * Invalid refresh token error response.
 */
export class InvalidRefreshTokenResponseDto {
  @ApiProperty({
    description: 'HTTP status code',
    example: 401,
  })
  statusCode: number;

  @ApiProperty({
    description: 'Error message indicating invalid or expired refresh token',
    enum: [
      'Invalid refresh token',
      'Refresh token expired',
      'Refresh token revoked',
      'Unauthorized',
    ],
    example: 'Invalid refresh token',
  })
  message: string;

  @ApiProperty({
    description: 'HTTP error name',
    example: 'Unauthorized',
  })
  error: string;

  @ApiPropertyOptional({
    description: 'Correlation ID for support reference',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  requestId?: string;
    description: 'Whether user email is verified',
    example: true,
  })
  emailVerified: boolean;

  @ApiProperty({
    description: 'Expiration time of the access token (Unix timestamp in seconds)',
    example: 1710274800,
  })
  expiresIn: number;

  @ApiProperty({
    description: 'Device information for session binding and security auditing',
    type: DeviceInfoDto,
  })
  device?: DeviceInfoDto;

  @ApiProperty({
    description: 'Whether multi-factor authentication (TOTP) is enabled on this account',
    example: false,
  })
  mfaEnabled: boolean;
}
