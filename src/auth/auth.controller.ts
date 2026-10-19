import {
  Controller,
  Get,
  Post,
  Body,
  Req,
  Res,
  Query,
  UseGuards,
  ValidationPipe,
  BadRequestException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthGuard } from '@nestjs/passport';
import type { Response } from 'express';
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
  ApiBearerAuth,
  ApiQuery,
  ApiBody,
  ApiBadRequestResponse,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiConflictResponse,
  ApiTooManyRequestsResponse,
  ApiInternalServerErrorResponse,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { CookieService } from './cookie.service';
import { DeviceFingerprintService } from './device-fingerprint.service';
import { BruteForceGuard } from './guards/brute-force.guard';
import { SignupDto } from './dto/signup.dto';
import { MagicLinkRequestDto } from './dto/magic-link.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { TokenResponseDto } from './dto/token-response.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import {
  AuthSuccessResponseDto,
  AuthTokensDto,
  EnableMfaDto,
  MessageResponseDto,
  MfaSetupResponseDto,
  MfaStatusResponseDto,
} from './dto/auth-responses.dto';
import { CsrfService } from '../csrf/csrf.service';

@ApiTags('auth')
@ApiBadRequestResponse({ description: 'Invalid input or validation error' })
@ApiUnauthorizedResponse({ description: 'Authentication required' })
@ApiForbiddenResponse({ description: 'Insufficient permissions' })
@ApiNotFoundResponse({ description: 'Resource not found' })
@ApiConflictResponse({ description: 'Resource already exists' })
@ApiTooManyRequestsResponse({ description: 'Rate limit exceeded' })
@ApiInternalServerErrorResponse({ description: 'Internal server error' })
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly cookieService: CookieService,
    private readonly deviceFingerprintService: DeviceFingerprintService,
    private readonly csrfService: CsrfService,
  ) {}

  @Post('signup')
  @ApiOperation({
    summary: 'Register a new user account',
    description:
      'Creates a new user account with email and password, provisions a custodial Stellar wallet, and sends an email verification link.',
  })
  @ApiBody({ type: SignupDto })
  @ApiResponse({
    status: 201,
    description: 'User created successfully',
    type: AuthSuccessResponseDto,
  })
  @ApiResponse({
    status: 400,
    description:
      'Bad Request - Invalid input, weak password, or validation failure. Password validation errors return a JSON-encoded message containing score, feedback, and suggestions.',
    schema: {
      example: {
        statusCode: 400,
        message: [
          'Please provide a valid email address',
          'Password must be at least 10 characters long',
        ],
        error: 'Bad Request',
      },
    },
  })
  @ApiResponse({
    status: 409,
    description: 'Conflict - Email already registered',
    schema: {
      example: {
        statusCode: 409,
        message: 'Email already registered',
        error: 'Conflict',
      },
    },
  })
  @ApiResponse({
    status: 429,
    description: 'Too Many Requests - Rate limit exceeded',
    examples: {
      rateLimited: {
        summary: 'Rate limited',
        value: { message: 'ThrottlerException: Too Many Requests', error: 'Too Many Requests', statusCode: 429 },
      },
    },
  })
  @ApiResponse({
    status: 500,
    description: 'Internal Server Error - Unexpected server error during user registration',
  })
  @ApiQuery({
    name: 'use_cookies',
    required: false,
    description: 'Return tokens in cookies instead of body',
  })
  @Throttle({ auth: { limit: 10, ttl: 60000 }, authStrict: { limit: 5, ttl: 60000 } })
  async signup(
    @Body(new ValidationPipe({ transform: true })) signupDto: SignupDto,
    @Res({ passthrough: true }) res: Response,
    @Query('use_cookies') useCookies?: string,
  ) {
    try {
      const result = await this.authService.signup(signupDto);
      if (useCookies === 'true') {
        this.cookieService.setTokenCookies(res, result.tokens);
        return { user: result.user };
      }
      return result;
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException('Signup failed');
    }
  }

  @Post('login')
  @ApiOperation({
    summary: 'Authenticate user and get access tokens',
    description:
      'Authenticates user with email and password (plus optional TOTP code if MFA is enabled). Clears brute force counters on success and returns access & refresh tokens.',
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
    description: 'Login successful',
    type: AuthSuccessResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Bad Request - Validation error (invalid email format, missing password)',
    schema: {
      example: {
        statusCode: 400,
        message: ['Please provide a valid email address'],
        error: 'Bad Request',
      },
    },
  })
  @ApiResponse({
    status: 401,
    description:
      'Unauthorized - Invalid credentials, wrong password, or missing/invalid TOTP code',
    schema: {
      example: {
        statusCode: 401,
        message: 'Invalid credentials. 4 attempts remaining.',
        error: 'Unauthorized',
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
    status: 423,
    description: 'Account locked due to brute force protection',
    examples: {
      locked: {
        summary: 'Account locked',
        value: {
          message: 'Account temporarily locked due to too many failed login attempts',
          lockoutTimeLeft: 900,
          error: 'ACCOUNT_LOCKED',
        },
      },
    },
  })
  @ApiResponse({
    status: 429,
    description: 'Too Many Requests - Rate limit exceeded',
    examples: {
      rateLimited: {
        summary: 'Rate limited',
        value: { message: 'ThrottlerException: Too Many Requests', error: 'Too Many Requests', statusCode: 429 },
      },
    },
  })
  @ApiResponse({
    status: 500,
    description: 'Internal Server Error - Unexpected error during login',
  })
  @ApiQuery({
    name: 'use_cookies',
    required: false,
    description: 'Return tokens in cookies instead of body',
  })
  @UseGuards(BruteForceGuard)
  @Throttle({ auth: { limit: 10, ttl: 60000 }, authStrict: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  async login(
    @Body(new ValidationPipe({ transform: true })) dto: LoginDto,
    @Req() req: any,
    @Res({ passthrough: true }) res: Response,
    @Query('use_cookies') useCookies?: string,
  ) {
    const deviceFingerprint =
      this.deviceFingerprintService.extractFromRequest(req);
    const fingerprint =
      this.deviceFingerprintService.generateFingerprint(deviceFingerprint);
    const result = await this.authService.login(dto);
    const csrfToken = this.csrfService.generateToken();
    this.csrfService.setCsrfCookie(res, csrfToken);

    if (useCookies === 'true') {
      this.cookieService.setTokenCookies(res, result.tokens);
      return { user: result.user, csrfToken };
    }
    return { ...result, csrfToken };
  }

  @Get('google')
  @ApiOperation({
    summary: 'Initiate Google OAuth flow',
    description:
      'Redirects the browser to Google\'s consent screen requesting the `profile` and ' +
      '`email` scopes. On approval, Google redirects back to `GET /auth/google/callback`. ' +
      'This endpoint is meant to be opened directly in a browser, not called via AJAX/fetch.',
  })
  @ApiResponse({ status: 302, description: 'Redirects to Google OAuth consent screen' })
  @ApiResponse({ status: 400, description: 'Bad Request - OAuth initialization failed' })
  @ApiResponse({ status: 500, description: 'Internal Server Error - Google OAuth configuration error' })
  @ApiTooManyRequestsResponse({ description: 'Too Many Requests - Rate limit exceeded (5 requests per minute per IP). Retry after the Retry-After seconds.' })
  @Throttle({ authStrict: { limit: 5, ttl: 60000 } })
  @UseGuards(AuthGuard('google'))
  googleAuth() {
    return;
  }

  @Get('google/callback')
  @ApiOperation({
    summary: 'Google OAuth callback',
    description:
      'Google redirects here after the user approves or denies access ' +
      '(configured via the `GOOGLE_CALLBACK_URL` env var, default ' +
      '`http://localhost:3000/auth/google/callback`). On success, finds or creates a user ' +
      'from the Google profile, issues access/refresh tokens, and always sets them as ' +
      'httpOnly cookies (this redirect-based flow has no JS context to read a JSON body). ' +
      'A CSRF token is returned in the response body and also set as a cookie. Use the ' +
      'returned `accessToken` as a `Bearer` token on subsequent authenticated requests ' +
      '(`Authorization: Bearer <accessToken>`).',
  })
  @ApiResponse({
    status: 200,
    description: 'Authentication successful — sets token cookies and returns the user + csrfToken',
    type: AuthSuccessResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Bad Request - Missing or invalid OAuth state/code parameters' })
  @ApiResponse({ status: 401, description: 'Google authentication failed or was denied' })
  @ApiResponse({ status: 409, description: 'Conflict - OAuth account linking conflict' })
  @ApiResponse({ status: 500, description: 'Internal Server Error - Failed to process Google OAuth callback' })
  @ApiTooManyRequestsResponse({ description: 'Too Many Requests - Rate limit exceeded (5 requests per minute per IP). Retry after the Retry-After seconds.' })
  @Throttle({ authStrict: { limit: 5, ttl: 60000 } })
  @UseGuards(AuthGuard('google'))
  async googleCallback(
    @Req() req: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    const user = req.user;
    const deviceFingerprint =
      this.deviceFingerprintService.extractFromRequest(req);
    const fingerprint =
      this.deviceFingerprintService.generateFingerprint(deviceFingerprint);
    const tokens = await this.authService.issueTokensWithRefresh(
      {
        id: user.id,
        email: user.email ?? null,
      },
      fingerprint,
    );
    const csrfToken = this.csrfService.generateToken();
    this.csrfService.setCsrfCookie(res, csrfToken);

    // Google OAuth always uses cookies (redirect flow — no JS to read a JSON body)
    this.cookieService.setTokenCookies(res, tokens);
    return { user, csrfToken };
  }

  @Post('magic-link')
  @ApiOperation({
    summary: 'Request magic link for passwordless login',
    description:
      'Sends a one-time login link to the given email if an account exists. ' +
      'The link token expires 15 minutes after issuance and can only be used once. ' +
      'Always responds with 200 (even for unknown emails) to prevent email enumeration.',
  })
  @ApiBody({ type: MagicLinkRequestDto })
  @ApiResponse({
    status: 200,
    description: 'Magic link sent if email exists',
    type: MessageResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid email format' })
  @ApiResponse({
    status: 429,
    description: 'Too many requests',
    examples: {
      rateLimited: {
        summary: 'Rate limited',
        value: { message: 'ThrottlerException: Too Many Requests', error: 'Too Many Requests', statusCode: 429 },
      },
    },
  })
  @ApiTooManyRequestsResponse({ description: 'Too Many Requests - Rate limit exceeded (5 requests per minute per IP). Retry after the Retry-After seconds.' })
  @Throttle({ authStrict: { limit: 5, ttl: 60000 } })
  async requestMagicLink(
    @Body(new ValidationPipe({ transform: true })) dto: MagicLinkRequestDto,
  ) {
    await this.authService.requestMagicLink(dto.email);
    // Always return 200 to avoid email enumeration
    return { message: 'If that email exists, a magic link has been sent.' };
  }

  @Get('verify-magic')
  @ApiOperation({
    summary: 'Verify magic link token',
    description:
      'Validates a magic link token and returns access/refresh tokens. ' +
      'Tokens expire 15 minutes after the link was requested and are single-use — ' +
      'reusing an already-consumed token returns 400.',
  })
  @ApiResponse({
    status: 200,
    description: 'Token verified successfully',
    type: AuthSuccessResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Token query parameter is missing' })
  @ApiResponse({
    status: 401,
    description:
      'Token has expired (>15 minutes old) or was already used. ' +
      'Examples: `"Magic link has expired"`, `"Magic link has already been used"`.',
  })
  @ApiResponse({
    status: 404,
    description: 'Token does not exist. Example: `"Invalid or expired magic link"`.',
  })
  @ApiQuery({ name: 'token', required: true, description: 'Magic link token' })
  @ApiQuery({
    name: 'use_cookies',
    required: false,
    description: 'Return tokens in cookies instead of body',
  })
  @ApiTooManyRequestsResponse({ description: 'Too Many Requests - Rate limit exceeded (5 requests per minute per IP). Retry after the Retry-After seconds.' })
  @Throttle({ authStrict: { limit: 5, ttl: 60000 } })
  async verifyMagicLink(
    @Query('token') token: string,
    @Req() req: any,
    @Res({ passthrough: true }) res: Response,
    @Query('use_cookies') useCookies?: string,
  ) {
    if (!token) {
      throw new BadRequestException('Token is required');
    }
    const deviceFingerprint =
      this.deviceFingerprintService.extractFromRequest(req);
    const fingerprint =
      this.deviceFingerprintService.generateFingerprint(deviceFingerprint);
    const result = await this.authService.verifyMagicLink(token, fingerprint);
    if (useCookies === 'true') {
      this.cookieService.setTokenCookies(res, result.tokens);
      return { user: result.user };
    }
    return result;
  }

  @Get('verify-email')
  @ApiOperation({
    summary: 'Verify email address',
    description: 'Confirms email verification token',
  })
  @ApiBody({ type: VerifyEmailDto })
  @ApiResponse({
    status: 200,
    description: 'Email verified successfully',
    type: MessageResponseDto,
    examples: {
      success: {
        summary: 'Success response',
        value: {
          message: 'Email successfully verified',
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid or expired token',
    examples: {
      invalidToken: {
        summary: 'Invalid token',
        value: { message: 'Invalid or expired verification link' },
      },
      expiredToken: {
        summary: 'Expired token',
        value: { message: 'Verification link has expired' },
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
    status: 404,
    description: 'Verification token not found',
    examples: {
      notFound: {
        summary: 'Token not found',
        value: { message: 'Invalid or expired verification link' },
      },
    },
  })
  @ApiTooManyRequestsResponse({ description: 'Too Many Requests - Rate limit exceeded (5 requests per minute per IP). Retry after the Retry-After seconds.' })
  @Throttle({ authStrict: { limit: 5, ttl: 60000 } })
  async verifyEmail(
    @Body(new ValidationPipe({ transform: true }))
    dto: VerifyEmailDto,
  ) {
    if (!dto.token) {
      throw new BadRequestException('Token is required');
    }
    return this.authService.verifyEmail(dto.token);
  }

  @Post('resend-verification')
  @ApiOperation({
    summary: 'Resend email verification',
    description: 'Resends a new email verification token to the user',
  })
  @ApiBody({
    type: ResendVerificationDto,
    examples: {
      resendVerification: {
        summary: 'Resend verification request',
        value: { email: 'user@example.com' },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Verification email sent if email exists',
    type: MessageResponseDto,
    examples: {
      success: {
        summary: 'Success response',
        value: {
          message:
            'If that email is registered, a verification email has been sent.',
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid email format',
    examples: {
      invalidEmail: {
        summary: 'Invalid email',
        value: {
          message: 'Validation failed: email must be a valid email address',
        },
      },
    },
  })
  @ApiResponse({
    status: 429,
    description: 'Too many requests',
    examples: {
      rateLimited: {
        summary: 'Rate limited',
        value: { message: 'ThrottlerException: Too Many Requests', error: 'Too Many Requests', statusCode: 429 },
      },
    },
  })
  @Throttle({ emailVerify: { limit: 3, ttl: 3600000 } })
  async resendVerification(
    @Body(new ValidationPipe({ transform: true })) dto: ResendVerificationDto,
  ) {
    await this.authService.resendVerification(dto.email);
    return {
      message:
        'If that email is registered, a verification email has been sent.',
    };
  }

  @Post('refresh')
  @ApiOperation({
    summary: 'Refresh access token',
    description:
      'Get new access token using refresh token. The old refresh token is revoked and a new one is issued (rotation). Supports body or cookie-based refresh token.',
  })
  @ApiBody({ type: RefreshTokenDto })
  @ApiResponse({
    status: 200,
    description: 'Tokens refreshed successfully',
    type: TokenResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Bad Request - Refresh token is missing or malformed',
    schema: {
      example: {
        statusCode: 400,
        message: 'Refresh token is required',
        error: 'Bad Request',
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
    description:
      'Unauthorized - Refresh token invalid, expired, revoked, or device fingerprint mismatch detected',
    schema: {
      example: {
        statusCode: 401,
        message: 'Invalid refresh token',
        error: 'Unauthorized',
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
    status: 429,
    description: 'Too Many Requests - Rate limit exceeded',
    examples: {
      rateLimited: {
        summary: 'Rate limited',
        value: { message: 'ThrottlerException: Too Many Requests', error: 'Too Many Requests', statusCode: 429 },
      },
    },
  })
  @ApiResponse({
    status: 500,
    description: 'Internal Server Error - Unexpected error during token refresh',
  })
  @ApiQuery({
    name: 'use_cookies',
    required: false,
    description: 'Return tokens in cookies instead of body',
  })
  @Throttle({ authStrict: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Body(new ValidationPipe({ transform: true })) dto: RefreshTokenDto,
    @Req() req: any,
    @Res({ passthrough: true }) res: Response,
    @Query('use_cookies') useCookies?: string,
  ) {
    const deviceFingerprint =
      this.deviceFingerprintService.extractFromRequest(req);
    const fingerprint =
      this.deviceFingerprintService.generateFingerprint(deviceFingerprint);
    // Support cookie-based refresh: fall back to cookie if body token absent
    const rawToken = dto.refreshToken ?? req.cookies?.['refresh_token'];
    if (!rawToken) {
      throw new BadRequestException('Refresh token is required');
    }
    const result = await this.authService.refreshTokens(rawToken, fingerprint);
    if (useCookies === 'true') {
      this.cookieService.setTokenCookies(res, result);
      return {};
    }
    return result;
  }

  @Post('logout')
  @ApiOperation({
    summary: 'Logout user',
    description: 'Revokes refresh token and clears cookies',
  })
  @ApiBody({ type: RefreshTokenDto })
  @ApiResponse({ status: 204, description: 'Logout successful' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Body(new ValidationPipe({ transform: true })) dto: RefreshTokenDto,
    @Req() req: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    const rawToken = dto.refreshToken ?? req.cookies?.['refresh_token'];
    if (rawToken) {
      await this.authService.logout(rawToken);
    }
    this.cookieService.clearTokenCookies(res);
  }

  @Post('forgot-password')
  @ApiOperation({
    summary: 'Request password reset',
    description: 'Sends password reset link to email',
  })
  @ApiBody({
    type: ForgotPasswordDto,
    examples: {
      requestPasswordReset: {
        summary: 'Request password reset',
        value: { email: 'user@example.com' },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Reset link sent if email exists',
    type: MessageResponseDto,
    examples: {
      success: {
        summary: 'Success response',
        value: { message: 'If that email exists, a reset link has been sent.' },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid email format',
    examples: {
      invalidEmail: {
        summary: 'Invalid email',
        value: {
          message: 'Validation failed: email must be a valid email address',
        },
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
    description: 'Too many requests',
    examples: {
      rateLimited: {
        summary: 'Rate limited',
        value: { message: 'ThrottlerException: Too Many Requests', error: 'Too Many Requests', statusCode: 429 },
      },
    },
  })
  @HttpCode(HttpStatus.OK)
  @Throttle({ sensitive: { limit: 3, ttl: 900000 }, authStrict: { limit: 5, ttl: 60000 } })
  async forgotPassword(
    @Body(new ValidationPipe({ transform: true })) dto: ForgotPasswordDto,
  ) {
    await this.authService.forgotPassword(dto.email);
    return { message: 'If that email exists, a reset link has been sent.' };
  }

  @Post('reset-password')
  @ApiOperation({
    summary: 'Reset password',
    description: 'Sets new password using reset token',
  })
  @ApiBody({
    type: ResetPasswordDto,
    examples: {
      resetPassword: {
        summary: 'Reset password',
        value: {
          token: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          newPassword: 'NewSecurePass123!',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Password reset successful',
    type: MessageResponseDto,
    examples: {
      success: {
        summary: 'Success response',
        value: { message: 'Password reset successful.' },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description:
      'Invalid/expired token or password does not meet strength requirements ' +
      '(min 10 characters, zxcvbn score >= 3). Password validation errors return a ' +
      'JSON-encoded message, e.g. ' +
      '`{"score":1,"feedback":["Add numbers"],"suggestions":"Password is too weak. Add numbers"}`.',
    examples: {
      invalidToken: {
        summary: 'Invalid or expired token',
        value: { message: 'Invalid reset token' },
      },
      weakPassword: {
        summary: 'Weak password',
        value: { message: 'Password must be at least 8 characters long' },
      },
    },
  })
  @ApiResponse({ status: 429, description: 'Too Many Requests - Rate limit exceeded (5 requests per minute per IP). Retry after the Retry-After seconds.' })
  @ApiTooManyRequestsResponse({ description: 'Too Many Requests - Rate limit exceeded (5 requests per minute per IP). Retry after the Retry-After seconds.' })
  @HttpCode(HttpStatus.OK)
  @Throttle({
    sensitive: { limit: 3, ttl: 900000 },
    authStrict: { limit: 5, ttl: 60000 },
  })
  async resetPassword(
    @Body(new ValidationPipe({ transform: true })) dto: ResetPasswordDto,
  ) {
    await this.authService.resetPassword(dto.token, dto.newPassword);
    return { message: 'Password reset successful.' };
  }

  @Post('mfa/setup')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Setup MFA',
    description: 'Generates MFA secret and QR code. Requires JWT.',
  })
  @ApiResponse({
    status: 200,
    description: 'MFA setup initiated',
    type: MfaSetupResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized — Bearer JWT required' })
  @ApiTooManyRequestsResponse({ description: 'Too Many Requests - Rate limit exceeded (5 requests per minute per IP). Retry after the Retry-After seconds.' })
  @HttpCode(HttpStatus.OK)
  @Throttle({ authStrict: { limit: 5, ttl: 60000 } })
  async setupMfa(@Req() req: any) {
    const userId = Number(req.user?.id ?? req.headers['x-user-id']);
    return this.authService.setupMfa(userId);
  }

  @Post('mfa/enable')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Enable MFA',
    description: 'Enables MFA after verifying setup code. Requires JWT.',
  })
  @ApiBody({ type: EnableMfaDto })
  @ApiResponse({
    status: 200,
    description: 'MFA enabled successfully',
    type: MfaStatusResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid verification code' })
  @ApiResponse({ status: 401, description: 'Unauthorized — Bearer JWT required' })
  @ApiResponse({ status: 429, description: 'Too Many Requests - Rate limit exceeded (5 requests per minute per IP). Retry after the Retry-After seconds.' })
  @ApiTooManyRequestsResponse({ description: 'Too Many Requests - Rate limit exceeded (5 requests per minute per IP). Retry after the Retry-After seconds.' })
  @HttpCode(HttpStatus.OK)
  @Throttle({
    sensitive: { limit: 3, ttl: 900000 },
    authStrict: { limit: 5, ttl: 60000 },
  })
  async enableMfa(@Req() req: any, @Body('code') code: string) {
    const userId = Number(req.user?.id ?? req.headers['x-user-id']);
    await this.authService.enableMfa(userId, code);
    return { enabled: true };
  }

  @Post('mfa/disable')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Disable MFA',
    description: 'Turns off multi-factor authentication. Requires JWT.',
  })
  @ApiResponse({
    status: 200,
    description: 'MFA disabled successfully',
    type: MfaStatusResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized — Bearer JWT required' })
  @ApiTooManyRequestsResponse({ description: 'Too Many Requests - Rate limit exceeded (5 requests per minute per IP). Retry after the Retry-After seconds.' })
  @HttpCode(HttpStatus.OK)
  @Throttle({ authStrict: { limit: 5, ttl: 60000 } })
  async disableMfa(@Req() req: any) {
    const userId = Number(req.user?.id ?? req.headers['x-user-id']);
    await this.authService.disableMfa(userId);
    return { enabled: false };
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
