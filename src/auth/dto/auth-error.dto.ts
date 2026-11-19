import { ApiProperty } from '@nestjs/swagger';

/**
 * Standard authentication failure response (401 Unauthorized).
 */
export class UnauthorizedErrorDto {
  @ApiProperty({
    description: 'HTTP status code',
    example: 401,
  })
  statusCode: number;

  @ApiProperty({
    description: 'Error code for programmatic handling',
    example: 'INVALID_CREDENTIALS',
    enum: [
      'INVALID_CREDENTIALS',
      'INVALID_TOKEN',
      'EXPIRED_TOKEN',
      'EMAIL_NOT_VERIFIED',
      'MFA_REQUIRED',
      'INVALID_TOTP',
      'TOKEN_REVOKED',
      'SESSION_HIJACK_DETECTED',
    ],
  })
  errorCode: string;

  @ApiProperty({
    description: 'Human-readable error message',
    example: 'Invalid email or password',
  })
  message: string;

  @ApiProperty({
    description: 'Additional context (optional)',
    example: 'remaining attempts: 2',
    required: false,
  })
  reason?: string;

  @ApiProperty({
    description: 'Request correlation ID for tracing',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    required: false,
  })
  requestId?: string;
}

/**
 * Account lockout response (423 Locked).
 * Returned when too many failed login attempts detected.
 */
export class LockedErrorDto {
  @ApiProperty({
    description: 'HTTP status code',
    example: 423,
  })
  statusCode: number;

  @ApiProperty({
    description: 'Error code for programmatic handling',
    example: 'ACCOUNT_LOCKED',
  })
  errorCode: string;

  @ApiProperty({
    description: 'Human-readable error message',
    example: 'Account temporarily locked due to too many failed login attempts',
  })
  message: string;

  @ApiProperty({
    description: 'Remaining lockout duration in seconds',
    example: 450,
  })
  lockoutTimeLeft: number;

  @ApiProperty({
    description: 'Lockout expiration time (Unix timestamp in seconds)',
    example: 1710274800,
  })
  lockedUntil: number;

  @ApiProperty({
    description: 'Request correlation ID for tracing',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    required: false,
  })
  requestId?: string;
}

/**
 * Rate limit exceeded response (429 Too Many Requests).
 */
export class TooManyRequestsErrorDto {
  @ApiProperty({
    description: 'HTTP status code',
    example: 429,
  })
  statusCode: number;

  @ApiProperty({
    description: 'Error message',
    example: 'Too Many Requests',
  })
  message: string;

  @ApiProperty({
    description: 'Error type',
    example: 'Too Many Requests',
  })
  error: string;

  @ApiProperty({
    description: 'Seconds to wait before retrying',
    example: 60,
    required: false,
  })
  retryAfter?: number;

  @ApiProperty({
    description: 'Request correlation ID for tracing',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    required: false,
  })
  requestId?: string;
}

/**
 * Permission denied response (403 Forbidden).
 */
export class ForbiddenErrorDto {
  @ApiProperty({
    description: 'HTTP status code',
    example: 403,
  })
  statusCode: number;

  @ApiProperty({
    description: 'Error code for programmatic handling',
    example: 'PERMISSION_DENIED',
  })
  errorCode: string;

  @ApiProperty({
    description: 'Human-readable error message',
    example: 'Insufficient permissions for this action',
  })
  message: string;

  @ApiProperty({
    description: 'Request correlation ID for tracing',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    required: false,
  })
  requestId?: string;
}
