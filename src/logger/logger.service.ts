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
 * - Sensitive fields (password, token, privateKey, secret) are redacted
 */
@Injectable({ scope: Scope.DEFAULT })
export class AppLoggerService implements LoggerService {
  private readonly level: string;
  private readonly isProduction: boolean;
  private readonly SENSITIVE_KEYS = new Set([
    'password',
    'token',
    'accesstoken',
    'refreshtoken',
    'privatekey',
    'secret',
    'mfasecret',
    'authorization',
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
      if (level === 'error') {
        console.error(prefix, message, extra ?? '');
      } else if (level === 'warn') {
        console.warn(prefix, message, extra ?? '');
      } else {
        console.log(prefix, message, extra ?? '');
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
