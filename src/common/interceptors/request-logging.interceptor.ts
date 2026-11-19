import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { Request, Response } from 'express';
import { AppLoggerService } from '../../logger/logger.service';

/**
 * Logs request start/completion with correlation ID.
 * Does not log bodies, headers, or query params to avoid leaking secrets.
 */
@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  constructor(private readonly logger: AppLoggerService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const started = Date.now();
    const requestId = request.requestId;
    const method = request.method;
    const path = request.originalUrl ?? request.url;

    this.logger.log('Incoming request', {
      context: 'HTTP',
      requestId,
      method,
      path,
    });

    return next.handle().pipe(
      tap({
        next: () => {
          this.logger.log('Request completed', {
            context: 'HTTP',
            requestId,
            method,
            path,
            statusCode: response.statusCode,
            durationMs: Date.now() - started,
          });
        },
        error: () => {
          this.logger.warn('Request failed', {
            context: 'HTTP',
            requestId,
            method,
            path,
            durationMs: Date.now() - started,
          });
        },
      }),
    );
  }
}
