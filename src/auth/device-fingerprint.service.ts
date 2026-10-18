import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';

export interface DeviceFingerprint {
  userAgentHash: string;
  ipAddress: string;
  acceptLanguage: string;
}

export interface RequestData {
  userAgent?: string;
  ipAddress?: string;
  acceptLanguage?: string;
}

@Injectable()
export class DeviceFingerprintService {
  generateFingerprint(data: RequestData): DeviceFingerprint {
    const userAgent = data.userAgent || '';
    const ipAddress = data.ipAddress || '';
    const acceptLanguage = data.acceptLanguage || '';

    return {
      userAgentHash: this.hashUserAgent(userAgent),
      ipAddress: ipAddress.trim(),
      acceptLanguage: acceptLanguage.trim(),
    };
  }

  private hashUserAgent(userAgent: string): string {
    return crypto.createHash('sha256').update(userAgent).digest('hex');
  }

  compareFingerprints(
    stored: DeviceFingerprint,
    current: DeviceFingerprint,
  ): boolean {
    return (
      stored.userAgentHash === current.userAgentHash &&
      stored.ipAddress === current.ipAddress &&
      stored.acceptLanguage === current.acceptLanguage
    );
  }

  extractFromRequest(request: any): RequestData {
    return {
      userAgent: request.headers['user-agent'],
      ipAddress: this.getClientIp(request),
      acceptLanguage: request.headers['accept-language'],
    };
  }

  private getClientIp(request: any): string {
    return (
      request.headers['x-forwarded-for']?.split(',')[0] ||
      request.headers['x-real-ip'] ||
      request.connection?.remoteAddress ||
      request.socket?.remoteAddress ||
      request.ip ||
      'unknown'
    );
  }
}
