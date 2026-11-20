import { Injectable, LoggerService, Scope } from '@nestjs/common';

export interface LogContext {
  requestId?: string;
  userId?: string | number;
  [key: string]: unknown;
}

/**
 * Structured JSON logger service.
 * - JSON output in production (NODE_ENV=production)
 * - Pretty-printed in development
 * - Log level controlled by LOG_LEVEL env var (default: info)
 * - Sensitive fields (password, token, secrets, OTP, cookies, auth headers)
 *   are redacted in BOTH production and development output.
 */
@Injectable({ scope: Scope.DEFAULT })
export class AppLoggerService implements LoggerService {
  private readonly level: string;
  private readonly isProduction: boolean;
  private readonly SENSITIVE_KEYS = new Set([
    'password',
    'newpassword',
    'token',
    'accesstoken',
    'refreshtoken',
    'refresh_token',
    'privatetoken',
    'privatekey',
    'secret',
    'mfasecret',
    'authorization',
    'cookie',
    'cookies',
    'csrf',
    'csrf-token',
    'x-csrf-token',
    'x-api-key',
    'apikey',
    'otp',
    'totp',
    'totpcode',
    'set-cookie',
  ]);

  private readonly LEVELS: Record<string, number> = {
    error: 0,
    warn: 1,
    log: 2,
    info: 2,
    debug: 3,
    verbose: 4,
  };

  constructor() {
    this.level = (process.env.LOG_LEVEL ?? 'info').toLowerCase();
    this.isProduction = process.env.NODE_ENV === 'production';
  }

  private shouldLog(level: string): boolean {
    return (this.LEVELS[level] ?? 2) <= (this.LEVELS[this.level] ?? 2);
  }

  private redact(obj: unknown): unknown {
    if (obj === null || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map((v) => this.redact(v));
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      result[k] = this.SENSITIVE_KEYS.has(k.toLowerCase()) ? '[REDACTED]' : this.redact(v);
    }
    return result;
  }

  private write(
    level: string,
    message: unknown,
    context?: string,
    extra?: LogContext,
  ): void {
    if (!this.shouldLog(level)) return;

    const entry: Record<string, unknown> = {
      level,
      timestamp: new Date().toISOString(),
      context: context ?? 'App',
      message,
      ...(extra ? (this.redact(extra) as object) : {}),
    };

    if (this.isProduction) {
      process.stdout.write(JSON.stringify(entry) + '\n');
    } else {
      const ts = entry.timestamp as string;
      const ctx = entry.context as string;
      const rid = extra?.requestId ? ` [${extra.requestId}]` : '';
      const prefix = `[${ts}] [${level.toUpperCase()}] [${ctx}]${rid}`;
      // Never log raw `extra` in development: use the redacted entry so
      // passwords, tokens, and secrets cannot leak via console output.
      const safeExtra = entry as Record<string, unknown>;
      if (level === 'error') {
        console.error(prefix, message, safeExtra ?? '');
      } else if (level === 'warn') {
        console.warn(prefix, message, safeExtra ?? '');
      } else {
        console.log(prefix, message, safeExtra ?? '');
      }
    }
  }

  log(message: unknown, contextOrExtra?: string | LogContext): void {
    if (typeof contextOrExtra === 'string') {
      this.write('info', message, contextOrExtra);
    } else {
      this.write('info', message, undefined, contextOrExtra);
    }
  }

  error(message: unknown, trace?: string, contextOrExtra?: string | LogContext): void {
    const extra = typeof contextOrExtra === 'object' ? contextOrExtra : undefined;
    const ctx = typeof contextOrExtra === 'string' ? contextOrExtra : undefined;
    this.write('error', message, ctx, { ...(extra ?? {}), trace });
  }

  warn(message: unknown, contextOrExtra?: string | LogContext): void {
    if (typeof contextOrExtra === 'string') {
      this.write('warn', message, contextOrExtra);
    } else {
      this.write('warn', message, undefined, contextOrExtra);
    }
  }

  debug(message: unknown, contextOrExtra?: string | LogContext): void {
    if (typeof contextOrExtra === 'string') {
      this.write('debug', message, contextOrExtra);
    } else {
      this.write('debug', message, undefined, contextOrExtra);
    }
  }

  verbose(message: unknown, contextOrExtra?: string | LogContext): void {
    if (typeof contextOrExtra === 'string') {
      this.write('verbose', message, contextOrExtra);
    } else {
      this.write('verbose', message, undefined, contextOrExtra);
    }
  }
}
