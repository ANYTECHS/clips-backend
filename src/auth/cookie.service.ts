import { Injectable } from '@nestjs/common';
import { Response } from 'express';
import { AppConfigService } from '../config/app-config.service';

export interface CookieOptions {
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'strict' | 'lax' | 'none';
  maxAge: number;
  path: string;
}

@Injectable()
export class CookieService {
  private readonly useSecure: boolean;
  private readonly sameSite: 'strict' | 'lax' | 'none';
  private readonly accessTokenTtlMs: number;
  private readonly refreshTokenTtlMs: number;

  constructor(private readonly appConfig: AppConfigService) {
    this.useSecure = appConfig.cookieSecure;
    this.sameSite = appConfig.cookieSameSite;
    this.accessTokenTtlMs = appConfig.jwtExpires * 1000;
    this.refreshTokenTtlMs = appConfig.jwtRefreshExpiresDays * 24 * 60 * 60 * 1000;
  }

  private baseOptions(maxAge: number): CookieOptions {
    return {
      httpOnly: true,
      secure: this.useSecure,
      sameSite: this.sameSite,
      maxAge,
      path: '/',
    };
  }

  setTokenCookies(
    res: Response,
    tokens: { accessToken: string; refreshToken?: string },
  ): void {
    res.cookie(
      'access_token',
      tokens.accessToken,
      this.baseOptions(this.accessTokenTtlMs),
    );

    if (tokens.refreshToken) {
      res.cookie(
        'refresh_token',
        tokens.refreshToken,
        // Scope refresh token to the refresh endpoint only
        { ...this.baseOptions(this.refreshTokenTtlMs), path: '/auth/refresh' },
      );
    }
  }

  clearTokenCookies(res: Response): void {
    res.clearCookie('access_token', { path: '/' });
    res.clearCookie('refresh_token', { path: '/auth/refresh' });
  }
}
