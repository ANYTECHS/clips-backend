import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
} from '@nestjs/common';
import { AuditLoggerService } from '../audit/audit-logger.service';

const SECURITY_EVENTS: Record<number, string> = {
  401: 'AUTH_FAILURE',
  403: 'PERMISSION_DENIED',
  429: 'RATE_LIMIT_EXCEEDED',
};

/**
 * Logs security-relevant HTTP exceptions (auth failures, permission denials,
 * rate-limit violations, account lockouts, admin actions) for auditing, then
 * returns the original error payload plus `requestId`. Only method, path
 * (without query secrets), IP, requestId, and userId are logged — never
 * request bodies, headers, passwords, tokens, or secrets. Stack traces are
 * stripped from client responses.
 */
@Catch(HttpException)
export class SecurityAuditFilter implements ExceptionFilter {
  constructor(private readonly audit: AuditLoggerService) {}

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

    let event =
      errorCode === 'ACCOUNT_LOCKED'
        ? 'ACCOUNT_LOCKOUT'
        : SECURITY_EVENTS[status];

    // Treat denied admin-plane calls as explicit admin actions for audit.
    if (
      status === 403 &&
      typeof request.originalUrl === 'string' &&
      request.originalUrl.startsWith('/admin')
    ) {
      event = 'ADMIN_ACTION';
    }

    if (event) {
      this.audit.logSecurityEvent(event as never, {
        method: request.method,
        path: request.originalUrl ?? request.url,
        ip: request.ip,
        requestId: request.requestId,
        userId: request.user?.id ?? request.user?.userId,
        statusCode: status,
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
