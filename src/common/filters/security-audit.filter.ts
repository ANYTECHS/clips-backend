import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
} from '@nestjs/common';
import { AppLoggerService } from '../../logger/logger.service';

const SECURITY_EVENTS: Record<number, string> = {
  401: 'AUTH_FAILURE',
  403: 'PERMISSION_DENIED',
  429: 'RATE_LIMIT_EXCEEDED',
};

/**
 * Logs security-relevant HTTP exceptions (auth failures, permission denials,
 * rate-limit violations, account lockouts) for auditing, then forwards the
 * original response unchanged. Never logs request bodies/headers, so
 * credentials and tokens can't leak into logs.
 */
@Catch(HttpException)
export class SecurityAuditFilter implements ExceptionFilter {
  constructor(private readonly logger: AppLoggerService) {}

  catch(exception: HttpException, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();
    const status = exception.getStatus();

    const exceptionResponse = exception.getResponse();
    const errorCode =
      typeof exceptionResponse === 'object' && exceptionResponse !== null
        ? (exceptionResponse as Record<string, unknown>).error
        : undefined;

    const event =
      errorCode === 'ACCOUNT_LOCKED'
        ? 'ACCOUNT_LOCKOUT'
        : SECURITY_EVENTS[status];

    if (event) {
      this.logger.warn(`Security event: ${event}`, {
        context: 'SecurityAudit',
        event,
        statusCode: status,
        method: request.method,
        path: request.originalUrl ?? request.url,
        ip: request.ip,
        requestId: request.id,
      });
    }

    response.status(status).json(exceptionResponse);
  }
}
