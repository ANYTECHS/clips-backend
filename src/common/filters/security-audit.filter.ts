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
 * rate-limit violations, account lockouts) for auditing, then returns the
 * original error payload plus `requestId`. Never logs request bodies/headers.
 * Stack traces are stripped from client responses.
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
        requestId: request.requestId,
      });
    }

    // Include correlation ID; never attach stack traces
    const body =
      typeof exceptionResponse === 'string'
        ? {
            statusCode: status,
            message: exceptionResponse,
            error: 'Error',
          }
        : { ...(exceptionResponse as Record<string, unknown>) };

    delete body.stack;
    delete body.trace;
    if (request.requestId) {
      body.requestId = request.requestId;
    }

    response.status(status).json(body);
  }
}
