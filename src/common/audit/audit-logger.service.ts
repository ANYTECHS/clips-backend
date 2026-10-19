import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { AppLoggerService } from '../../logger/logger.service';

export type SecurityEvent =
  | 'AUTH_FAILURE'
  | 'PERMISSION_DENIED'
  | 'RATE_LIMIT_EXCEEDED'
  | 'ACCOUNT_LOCKOUT'
  | 'ADMIN_ACTION';

/**
 * Central security-audit logger.
 *
 * All security events (failed auth, 403s, 429s, lockouts, admin actions) go
 * through here so PII handling is consistent: emails are SHA-256 hashed,
 * and request bodies, headers, passwords, tokens, and secrets are never
 * logged. Bodies/headers must never be passed in `details`.
 */
@Injectable()
export class AuditLoggerService {
  constructor(private readonly logger: AppLoggerService) {}

  hashEmail(email: string): string {
    return createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
  }

  logSecurityEvent(
    event: SecurityEvent,
    fields: {
      method?: string;
      path?: string;
      ip?: string;
      requestId?: string | number;
      userId?: string | number;
      emailHash?: string;
      statusCode?: number;
    },
  ): void {
    this.logger.warn(`Security event: ${event}`, {
      context: 'SecurityAudit',
      event,
      method: fields.method,
      path: fields.path,
      ip: fields.ip,
      requestId: fields.requestId,
      userId: fields.userId,
      emailHash: fields.emailHash,
      statusCode: fields.statusCode,
    });
  }
}
