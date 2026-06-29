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
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { CookieService } from './cookie.service';
import { DeviceFingerprintService } from './device-fingerprint.service';
import { BruteForceGuard } from './guards/brute-force.guard';
import { SignupDto } from './dto/signup.dto';
import { MagicLinkRequestDto } from './dto/magic-link.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { CsrfService } from '../csrf/csrf.service';

@ApiTags('auth')
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
  @ApiResponse({ status: 400, description: 'Invalid input or user already exists' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @ApiQuery({ name: 'use_cookies', required: false, description: 'Return tokens in cookies instead of body' })
  @Throttle({ auth: { limit: 10, ttl: 60000 } })
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
  @ApiResponse({ status: 400, description: 'Invalid credentials' })
  @ApiResponse({ status: 401, description: 'Authentication failed' })
  @ApiResponse({ status: 429, description: 'Too many requests - brute force protection' })
  @ApiQuery({ name: 'use_cookies', required: false, description: 'Return tokens in cookies instead of body' })
  @UseGuards(BruteForceGuard)
  @Throttle({ auth: { limit: 10, ttl: 60000 } })
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
  @ApiOperation({ summary: 'Initiate Google OAuth flow', description: 'Redirects to Google for authentication' })
  @ApiResponse({ status: 302, description: 'Redirects to Google OAuth' })
  @UseGuards(AuthGuard('google'))
  googleAuth() {
    return;
  }

  @Get('google/callback')
  @ApiOperation({ summary: 'Google OAuth callback', description: 'Handles Google OAuth redirect' })
  @ApiResponse({ status: 200, description: 'Authentication successful' })
  @ApiResponse({ status: 401, description: 'Authentication failed' })
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
  @ApiOperation({ summary: 'Request magic link for passwordless login' })
  @ApiResponse({ status: 200, description: 'Magic link sent if email exists' })
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
  @ApiOperation({ summary: 'Verify magic link token', description: 'Validates magic link and returns tokens' })
  @ApiResponse({ status: 200, description: 'Token verified successfully' })
  @ApiResponse({ status: 400, description: 'Invalid or expired token' })
  @ApiQuery({ name: 'token', required: true, description: 'Magic link token' })
  @ApiQuery({ name: 'use_cookies', required: false, description: 'Return tokens in cookies instead of body' })
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
  @ApiOperation({ summary: 'Verify email address', description: 'Confirms email verification token' })
  @ApiResponse({ status: 200, description: 'Email verified successfully' })
  @ApiResponse({ status: 400, description: 'Invalid or expired token' })
  @ApiQuery({ name: 'token', required: true, description: 'Email verification token' })
  async verifyEmail(@Query('token') token: string) {
    if (!token) {
      throw new BadRequestException('Token is required');
    }
    return this.authService.verifyEmail(token);
  }

  @Post('refresh')
  @ApiOperation({ summary: 'Refresh access token', description: 'Get new access token using refresh token' })
  @ApiResponse({ status: 200, description: 'Tokens refreshed successfully' })
  @ApiResponse({ status: 400, description: 'Invalid or expired refresh token' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiQuery({ name: 'use_cookies', required: false, description: 'Return tokens in cookies instead of body' })
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
  @ApiOperation({ summary: 'Logout user', description: 'Revokes refresh token and clears cookies' })
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
  @ApiOperation({ summary: 'Request password reset', description: 'Sends password reset link to email' })
  @ApiResponse({ status: 200, description: 'Reset link sent if email exists' })
  @ApiResponse({ status: 400, description: 'Invalid email format' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @HttpCode(HttpStatus.OK)
  @Throttle({ sensitive: { limit: 3, ttl: 900000 } })
  async forgotPassword(
    @Body(new ValidationPipe({ transform: true })) dto: ForgotPasswordDto,
  ) {
    await this.authService.forgotPassword(dto.email);
    return { message: 'If that email exists, a reset link has been sent.' };
  }

  @Post('reset-password')
  @ApiOperation({ summary: 'Reset password', description: 'Sets new password using reset token' })
  @ApiResponse({ status: 200, description: 'Password reset successful' })
  @ApiResponse({ status: 400, description: 'Invalid token or password requirements not met' })
  @HttpCode(HttpStatus.OK)
  async resetPassword(
    @Body(new ValidationPipe({ transform: true })) dto: ResetPasswordDto,
  ) {
    await this.authService.resetPassword(dto.token, dto.newPassword);
    return { message: 'Password reset successful.' };
  }

  @Post('mfa/setup')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Setup MFA', description: 'Generates MFA secret and QR code' })
  @ApiResponse({ status: 200, description: 'MFA setup initiated' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @HttpCode(HttpStatus.OK)
  async setupMfa(@Req() req: any) {
    const userId = Number(req.user?.id ?? req.headers['x-user-id']);
    return this.authService.setupMfa(userId);
  }

  @Post('mfa/enable')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Enable MFA', description: 'Enables MFA after verifying setup code' })
  @ApiResponse({ status: 200, description: 'MFA enabled successfully' })
  @ApiResponse({ status: 400, description: 'Invalid verification code' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @HttpCode(HttpStatus.OK)
  async enableMfa(@Req() req: any, @Body('code') code: string) {
    const userId = Number(req.user?.id ?? req.headers['x-user-id']);
    await this.authService.enableMfa(userId, code);
    return { enabled: true };
  }

  @Post('mfa/disable')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Disable MFA', description: 'Turns off multi-factor authentication' })
  @ApiResponse({ status: 200, description: 'MFA disabled successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @HttpCode(HttpStatus.OK)
  async disableMfa(@Req() req: any) {
    const userId = Number(req.user?.id ?? req.headers['x-user-id']);
    await this.authService.disableMfa(userId);
    return { enabled: false };
  }
}
