import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiExtraModels,
} from '@nestjs/swagger';
import { Public } from './decorators/public.decorator';
import { LoginDto } from './dto/login.dto';
import { AuthResponseDto } from './dto/auth-response.dto';
import {
  UnauthorizedErrorDto,
  LockedErrorDto,
  TooManyRequestsErrorDto,
} from './dto/auth-error.dto';

/**
 * Authentication endpoints (login, signup, refresh, password reset).
 *
 * Implements:
 * - JWT-based authentication with email-verification gating
 * - Multi-factor authentication (TOTP) support
 * - Brute-force protection with account lockout (HTTP 423)
 * - Rate limiting on auth actions (HTTP 429)
 * - Device fingerprinting for refresh token binding
 */
@ApiTags('auth')
@ApiExtraModels(
  AuthResponseDto,
  UnauthorizedErrorDto,
  LockedErrorDto,
  TooManyRequestsErrorDto,
)
@Controller('auth')
export class AuthController {
  /**
   * POST /auth/login
   *
   * Authenticate with email and password.
   * Optional TOTP code required for MFA-enabled accounts.
   *
   * Success: returns access token, refresh token, and device info.
   *
   * Failures:
   * - 401 Unauthorized: invalid email/password or unverified email
   * - 401 Unauthorized: TOTP required or invalid TOTP code
   * - 423 Locked: account locked after repeated failed attempts
   * - 429 Too Many Requests: rate limit exceeded on login endpoint
   */
  @Post('login')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Login with email and password',
    description:
      'Authenticate using email credentials. If multi-factor authentication (TOTP) is enabled on the account, ' +
      'the response will indicate TOTP is required and a second request with the `totpCode` must be sent. ' +
      'Failed attempts are tracked and the account is locked (423) after 5 consecutive failures. ' +
      'Device information is captured and used to bind refresh tokens to the device.',
  })
  @ApiBody({ type: LoginDto })
  @ApiResponse({
    status: 200,
    description: 'Successfully authenticated',
    type: AuthResponseDto,
    schema: {
      example: {
        accessToken:
          'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOjEsImVtYWlsIjoiY3VzdG9tZXJAZXhhbXBsZS5jb20iLCJlbWFpbFZlcmlmaWVkIjp0cnVlLCJpYXQiOjE3MTAyNzEyMDAsImV4cCI6MTcxMDI3NDgwMH0.',
        refreshToken: 'refresh_opaque_value_32bytes',
        userId: 1,
        email: 'customer@example.com',
        emailVerified: true,
        expiresIn: 3600,
        device: {
          userAgent:
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          deviceFingerprint: 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6',
          ipAddress: '192.0.2.1',
          platform: 'Windows',
          browser: 'Chrome 120.0',
        },
        mfaEnabled: false,
      },
    },
  })
  @ApiResponse({
    status: 401,
    description:
      'Unauthorized — invalid credentials, unverified email, or missing/invalid TOTP code',
    type: UnauthorizedErrorDto,
    schema: {
      example: {
        statusCode: 401,
        errorCode: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password',
        reason: 'remaining attempts: 2',
        requestId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized — TOTP code required for MFA-enabled account',
    schema: {
      example: {
        statusCode: 401,
        errorCode: 'MFA_REQUIRED',
        message:
          'Multi-factor authentication required. Send TOTP code in next request.',
        requestId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized — email not verified',
    schema: {
      example: {
        statusCode: 401,
        errorCode: 'EMAIL_NOT_VERIFIED',
        message: 'Email address must be verified before login',
        reason: 'Verify your email and try again',
        requestId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
      },
    },
  })
  @ApiResponse({
    status: 423,
    description:
      'Locked — account temporarily locked after repeated failed login attempts',
    type: LockedErrorDto,
    schema: {
      example: {
        statusCode: 423,
        errorCode: 'ACCOUNT_LOCKED',
        message:
          'Account temporarily locked due to too many failed login attempts',
        lockoutTimeLeft: 450,
        lockedUntil: 1710274800,
        requestId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
      },
    },
  })
  @ApiResponse({
    status: 429,
    description:
      'Too Many Requests — rate limit exceeded (default: 5 attempts per 60 seconds for auth endpoints)',
    type: TooManyRequestsErrorDto,
    schema: {
      example: {
        statusCode: 429,
        message: 'Too Many Requests',
        error: 'Too Many Requests',
        retryAfter: 60,
        requestId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
      },
    },
  })
  async login(@Body() loginDto: LoginDto): Promise<AuthResponseDto> {
    // Implementation will be added in AuthService
    throw new Error('Not implemented');
  }
}
