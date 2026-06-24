import { Injectable } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';
import * as crypto from 'crypto';

@Injectable()
export class CsrfService {
  constructor(private readonly appConfig: AppConfigService) {}

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
    res.cookie('_csrf', token, {
      httpOnly: false,
      secure: this.appConfig.isProduction,
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000,
    });
  }

  clearCsrfCookie(res: any): void {
    res.clearCookie('_csrf');
  }
}
