import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  Param,
  HttpCode,
  HttpStatus,
  Req,
  Res,
} from '@nestjs/common';
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
  ApiBearerAuth,
  ApiBody,
  ApiQuery,
  ApiParam,
  ApiProduces,
} from '@nestjs/swagger';
import { Request, Response } from 'express';
import { ApiStandardErrors } from '../common/decorators/api-standard-errors.decorator';
import { Throttle } from '@nestjs/throttler';
import { LoginDto, LoginResponseDto } from './dto/login.dto';
import { SignupDto, SignupResponseDto } from './dto/signup.dto';
import {
  ForgotPasswordDto,
  ForgotPasswordResponseDto,
} from './dto/forgot-password.dto';
import {
  ResetPasswordDto,
  ResetPasswordResponseDto,
} from './dto/reset-password.dto';
import {
  OAuthCallbackDto,
  OAuthResponseDto,
  OAuthProvider,
} from './dto/oauth.dto';

/**
 * Authentication Controller
 *
 * Handles user authentication flows:
 * - Login with email/password
 * - Registration/signup
 * - OAuth social login (Google, Twitter, Facebook, GitHub)
 * - Password reset (forgot/reset)
 * - CSRF token management
 * - Bearer token authentication
 *
 * All state-changing endpoints require CSRF token when using cookie auth.
 * JWT Bearer auth is exempt from CSRF protection.
 */
@ApiTags('auth')
@Controller('auth')
@ApiStandardErrors()
export class AuthController {
  /**
   * User login with email and password.
   *
   * Issues JWT access + refresh tokens and sets httpOnly cookies.
   * Also issues a CSRF token in the `_csrf` cookie for subsequent requests.
   *
   * Rate limited to 10 requests per 60 seconds per IP.
   */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({
    summary: 'Login with email and password',
    description:
      'Authenticates a user with email and password. Returns JWT tokens and sets CSRF cookie.\n\n' +
      '**CSRF Token:**\n' +
      'A CSRF token is issued in the `_csrf` cookie and must be included in the `X-CSRF-Token` header for subsequent state-changing requests.\n\n' +
      '**Rate Limit:** 10 requests per 60 seconds per IP.',
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
    description: 'Login successful. Returns JWT tokens and CSRF token.',
    type: LoginResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid credentials or incorrect TOTP code',
    schema: {
      example: {
        statusCode: 401,
        message: 'Invalid email or password',
        error: 'Unauthorized',
        requestId: '550e8400-e29b-41d4-a716-446655440000',
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
    status: 429,
    description: 'Too many login attempts',
    schema: {
      example: {
        statusCode: 429,
        message: 'ThrottlerException: Too Many Requests',
        error: 'Too Many Requests',
        requestId: '550e8400-e29b-41d4-a716-446655440000',
      },
    },
  })
  async login(
    @Body() loginDto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponseDto> {
    // Implementation would go here
    throw new Error('Not implemented');
  }

  /**
   * User registration/signup.
   *
   * Creates a new user account with email and password.
   * Issues JWT access + refresh tokens and sets httpOnly cookies.
   * Also issues a CSRF token in the `_csrf` cookie.
   *
   * Rate limited to 10 requests per 60 seconds per IP.
   */
  @Post('signup')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({
    summary: 'Register a new user account',
    description:
      'Creates a new user with email and password. Returns JWT tokens and sets CSRF cookie.\n\n' +
      '**Password Requirements:**\n' +
      '- Minimum 8 characters\n' +
      '- At least one uppercase letter\n' +
      '- At least one lowercase letter\n' +
      '- At least one number\n' +
      '- At least one special character (!@#$%^&*(),.?":{}|<>)\n\n' +
      '**Rate Limit:** 10 requests per 60 seconds per IP.',
  })
  @ApiBody({ type: SignupDto })
  @ApiResponse({
    status: 201,
    description: 'User account created successfully. Returns JWT tokens.',
    type: SignupResponseDto,
  })
  @ApiResponse({
    status: 409,
    description: 'Email already registered',
    schema: {
      example: {
        statusCode: 409,
        message: 'An account with this email already exists',
        error: 'Conflict',
        requestId: '550e8400-e29b-41d4-a716-446655440000',
      },
    },
  })
  async signup(
    @Body() signupDto: SignupDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SignupResponseDto> {
    // Implementation would go here
    throw new Error('Not implemented');
  }

  /**
   * Initiate password reset by email.
   *
   * Sends a password reset email if the account exists.
   * Returns success regardless to prevent user enumeration.
   *
   * Rate limited to 3 requests per 15 minutes per IP.
   */
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: 900000 } }) // 3 per 15 minutes
  @ApiOperation({
    summary: 'Request password reset email',
    description:
      'Sends a password reset link to the provided email address if an account exists.\n\n' +
      '**Security Note:**\n' +
      'Returns the same success response whether the email exists or not to prevent user enumeration attacks.\n\n' +
      '**Rate Limit:** 3 requests per 15 minutes per IP.\n\n' +
      '**Token Expiration:** Reset tokens expire after 1 hour.',
  })
  @ApiBody({ type: ForgotPasswordDto })
  @ApiResponse({
    status: 200,
    description:
      'Generic success message (same response regardless of email existence)',
    type: ForgotPasswordResponseDto,
  })
  async forgotPassword(
    @Body() forgotPasswordDto: ForgotPasswordDto,
    @Req() req: Request,
  ): Promise<ForgotPasswordResponseDto> {
    // Implementation would go here
    throw new Error('Not implemented');
  }

  /**
   * Reset password with token from email.
   *
   * Validates the reset token and updates the user's password.
   * Invalidates all existing sessions/tokens.
   *
   * Rate limited to 5 requests per 15 minutes per IP.
   */
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 900000 } }) // 5 per 15 minutes
  @ApiOperation({
    summary: 'Reset password with token',
    description:
      'Resets the user password using the token from the email link.\n\n' +
      '**Password Requirements:**\n' +
      '- Minimum 8 characters\n' +
      '- At least one uppercase letter\n' +
      '- At least one lowercase letter\n' +
      '- At least one number\n' +
      '- At least one special character (!@#$%^&*(),.?":{}|<>)\n\n' +
      '**Rate Limit:** 5 requests per 15 minutes per IP.\n\n' +
      '**Token Expiration:** Reset tokens are valid for 1 hour after issuance.',
  })
  @ApiBody({ type: ResetPasswordDto })
  @ApiResponse({
    status: 200,
    description: 'Password reset successfully',
    type: ResetPasswordResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid or expired reset token',
    schema: {
      example: {
        statusCode: 400,
        message: 'Invalid or expired reset token',
        error: 'Bad Request',
        requestId: '550e8400-e29b-41d4-a716-446655440000',
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
    description: 'Reset token has expired',
    schema: {
      example: {
        statusCode: 401,
        message: 'Reset token has expired. Please request a new password reset.',
        error: 'Unauthorized',
        requestId: '550e8400-e29b-41d4-a716-446655440000',
      },
    },
  })
  async resetPassword(
    @Body() resetPasswordDto: ResetPasswordDto,
    @Req() req: Request,
  ): Promise<ResetPasswordResponseDto> {
    // Implementation would go here
    throw new Error('Not implemented');
  }

  /**
   * Initiate OAuth flow for social login.
   *
   * Redirects to the OAuth provider's consent screen.
   * After user authorization, the provider redirects back to the callback endpoint.
   *
   * Supported providers: google, twitter, facebook, github
   */
  @Get('oauth/:provider')
  @ApiOperation({
    summary: 'Initiate OAuth flow',
    description:
      'Redirects to the OAuth provider consent screen.\n\n' +
      '**Supported Providers:**\n' +
      '- `google` - Google OAuth 2.0\n' +
      '- `twitter` - Twitter/X OAuth 2.0\n' +
      '- `facebook` - Facebook OAuth 2.0\n' +
      '- `github` - GitHub OAuth 2.0\n\n' +
      '**Flow:**\n' +
      '1. Client calls `GET /auth/oauth/{provider}`\n' +
      '2. Server redirects to provider consent screen\n' +
      '3. User authorizes the application\n' +
      '4. Provider redirects to `/auth/oauth/{provider}/callback` with code\n' +
      '5. Server exchanges code for tokens and creates/updates user account\n' +
      '6. Client receives JWT tokens',
  })
  @ApiParam({
    name: 'provider',
    enum: OAuthProvider,
    description: 'OAuth provider (google, twitter, facebook, github)',
  })
  @ApiResponse({
    status: 302,
    description: 'Redirect to OAuth provider consent screen',
  })
  @ApiResponse({
    status: 400,
    description: 'Unsupported OAuth provider',
    schema: {
      example: {
        statusCode: 400,
        message: 'Unsupported OAuth provider',
        error: 'Bad Request',
        requestId: '550e8400-e29b-41d4-a716-446655440000',
      },
    },
  })
  async oauthInitiate(
    @Param('provider') provider: OAuthProvider,
    @Res() res: Response,
  ): Promise<void> {
    // Implementation would redirect to OAuth provider
    throw new Error('Not implemented');
  }

  /**
   * OAuth callback endpoint.
   *
   * Receives authorization code from OAuth provider, exchanges it for tokens,
   * creates or updates user account, and issues JWT tokens.
   */
  @Get('oauth/:provider/callback')
  @ApiOperation({
    summary: 'OAuth callback endpoint',
    description:
      'Handles the OAuth provider callback after user authorization.\n\n' +
      '**Process:**\n' +
      '1. Receives authorization code from provider\n' +
      '2. Exchanges code for access token with provider\n' +
      '3. Fetches user profile from provider\n' +
      '4. Creates new account or links to existing account\n' +
      '5. Issues JWT access and refresh tokens\n' +
      '6. Sets CSRF cookie\n\n' +
      '**This endpoint is called by the OAuth provider, not directly by clients.**',
  })
  @ApiParam({
    name: 'provider',
    enum: OAuthProvider,
    description: 'OAuth provider (google, twitter, facebook, github)',
  })
  @ApiQuery({
    name: 'code',
    type: String,
    description: 'Authorization code from OAuth provider',
    required: true,
  })
  @ApiQuery({
    name: 'state',
    type: String,
    description: 'State parameter for CSRF protection',
    required: false,
  })
  @ApiResponse({
    status: 200,
    description:
      'OAuth authentication successful. Returns JWT tokens and user info.',
    type: OAuthResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid authorization code or state mismatch',
    schema: {
      example: {
        statusCode: 400,
        message: 'Invalid authorization code or state mismatch',
        error: 'Bad Request',
        requestId: '550e8400-e29b-41d4-a716-446655440000',
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
    description: 'OAuth provider rejected the authorization',
    schema: {
      example: {
        statusCode: 401,
        message: 'OAuth provider rejected the authorization',
        error: 'Unauthorized',
        requestId: '550e8400-e29b-41d4-a716-446655440000',
      },
    },
  })
  async oauthCallback(
    @Param('provider') provider: OAuthProvider,
    @Query() callbackDto: OAuthCallbackDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<OAuthResponseDto> {
    // Implementation would go here
    throw new Error('Not implemented');
  }

  /**
   * Refresh access token using refresh token.
   *
   * Protected by Bearer authentication.
   */
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Refresh access token',
    description:
      'Issues a new access token using a valid refresh token.\n\n' +
      '**Authentication:** Requires valid refresh token in Authorization header.\n\n' +
      '**Rate Limit:** 10 requests per 60 seconds per user.',
  })
  @ApiResponse({
    status: 200,
    description: 'New access token issued',
    schema: {
      example: {
        accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        tokenType: 'Bearer',
        expiresIn: 3600,
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
    status: 401,
    description: 'Invalid or expired refresh token',
    schema: {
      example: {
        statusCode: 401,
        message: 'Invalid or expired refresh token',
        error: 'Unauthorized',
        requestId: '550e8400-e29b-41d4-a716-446655440000',
      },
    },
  })
  async refresh(@Req() req: Request): Promise<{ accessToken: string; tokenType: string; expiresIn: number }> {
    // Implementation would go here
    throw new Error('Not implemented');
  }

  /**
   * Logout the current user.
   *
   * Invalidates the current session and clears cookies.
   * Protected by Bearer authentication.
   */
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Logout current user',
    description:
      'Invalidates the current session, clears tokens and cookies.\n\n' +
      '**Authentication:** Requires valid JWT in Authorization header.',
  })
  @ApiResponse({
    status: 200,
    description: 'Logout successful',
    schema: {
      example: {
        message: 'Logout successful',
      },
    },
  })
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ message: string }> {
    // Implementation would go here
    throw new Error('Not implemented');
  }
}
