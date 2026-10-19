import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

@Injectable()
export class CsrfService {
  constructor(private configService: ConfigService) {}

  generateToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  validateToken(token: string, cookieToken: string): boolean {
    if (!token || !cookieToken) {
      return false;
    }
    return token === cookieToken;
  }

  setCsrfCookie(res: any, token: string): void {
    const isProduction = this.configService.get('NODE_ENV') === 'production';

    res.cookie('_csrf', token, {
      httpOnly: false, // Allow JavaScript to read for header inclusion
      secure: isProduction,
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    });
  }

  clearCsrfCookie(res: any): void {
    res.clearCookie('_csrf');
  }
}
