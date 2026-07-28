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
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
  ApiBody,
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
  @ApiOperation({ summary: 'Register a new user account' })
  @ApiResponse({ status: 201, description: 'User created successfully' })
  @ApiResponse({
    status: 400,
    description: 'Invalid input or user already exists',
    schema: {
      example: {
        statusCode: 400,
        message: [
          'Please provide a valid email address',
          'Password is too short (min 8 characters)',
        ],
        error: 'Bad Request',
      },
    },
  @ApiBody({ type: SignupDto })
  @ApiResponse({
    status: 201,
    description: 'User created successfully',
    type: AuthSuccessResponseDto,
  })
  @ApiResponse({
    status: 400,
    description:
      'Invalid input, weak password, or user already exists. Password validation errors ' +
      'return a JSON-encoded message, e.g. ' +
      '`{"score":1,"feedback":["Add numbers"],"suggestions":"Password is too weak. Add numbers"}`.',
  })
  @ApiResponse({ status: 429, description: 'Too many requests' })
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
  @ApiOperation({ summary: 'Authenticate user and get access tokens' })
  @ApiResponse({ status: 200, description: 'Login successful' })
  @ApiResponse({
    status: 400,
    description: 'Invalid credentials',
    schema: {
      example: {
        statusCode: 400,
        message: ['Please provide a valid email address'],
        error: 'Bad Request',
      },
    },
  })
  @ApiBody({ type: LoginDto })
  @ApiResponse({
    status: 200,
    description: 'Login successful',
    type: AuthSuccessResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid credentials' })
  @ApiResponse({ status: 401, description: 'Authentication failed' })
  @ApiResponse({
    status: 429,
    description: 'Too many requests - brute force protection',
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
  @ApiResponse({ status: 401, description: 'Google authentication failed or was denied' })
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
  @ApiResponse({ status: 429, description: 'Too many requests' })
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
        value: { message: 'Too many requests' },
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
  @ApiOperation({ summary: 'Refresh access token', description: 'Get new access token using refresh token. The old refresh token is revoked and a new one is issued (rotation).' })
  @ApiResponse({ status: 200, description: 'Tokens refreshed successfully', type: TokenResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid or expired refresh token' })
  @ApiResponse({ status: 401, description: 'Unauthorized - refresh token invalid, expired, or revoked' })
  @ApiQuery({ name: 'use_cookies', required: false, description: 'Return tokens in cookies instead of body' })
  @ApiOperation({
    summary: 'Refresh access token',
    description: 'Get new access token using refresh token',
  })
  @ApiBody({ type: RefreshTokenDto })
  @ApiResponse({
    status: 200,
    description: 'Tokens refreshed successfully',
    type: AuthTokensDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid or expired refresh token' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
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
      },
    },
  })
  @ApiResponse({
    status: 429,
    description: 'Too many requests',
    examples: {
      rateLimited: {
        summary: 'Rate limited',
        value: { message: 'Too many requests' },
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
    description: 'Invalid token or password requirements not met',
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
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @HttpCode(HttpStatus.OK)
  @Throttle({ authStrict: { limit: 5, ttl: 60000 } })
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
  @HttpCode(HttpStatus.OK)
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
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @HttpCode(HttpStatus.OK)
  @Throttle({ authStrict: { limit: 5, ttl: 60000 } })
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
  @HttpCode(HttpStatus.OK)
  async disableMfa(@Req() req: any) {
    const userId = Number(req.user?.id ?? req.headers['x-user-id']);
    await this.authService.disableMfa(userId);
    return { enabled: false };
  }
}
