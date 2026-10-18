import { Injectable } from '@nestjs/common';
import { Response } from 'express';

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

  constructor() {
    this.useSecure = process.env.COOKIE_SECURE !== 'false'; // default true
    const raw = (process.env.COOKIE_SAME_SITE ?? 'lax').toLowerCase();
    this.sameSite = raw === 'strict' || raw === 'none' ? raw : 'lax';

    const jwtExpires =
      Number(process.env.JWT_EXPIRES) > 0
        ? Number(process.env.JWT_EXPIRES)
        : 3600;
    const refreshDays =
      Number(process.env.JWT_REFRESH_EXPIRES_DAYS) > 0
        ? Number(process.env.JWT_REFRESH_EXPIRES_DAYS)
        : 14;

    this.accessTokenTtlMs = jwtExpires * 1000;
    this.refreshTokenTtlMs = refreshDays * 24 * 60 * 60 * 1000;
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
