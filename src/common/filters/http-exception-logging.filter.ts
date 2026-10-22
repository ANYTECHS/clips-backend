import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { AppLoggerService } from '../../logger/logger.service';
import { ApiResponseDto } from '../dtos/api-response.dto';

/**
 * Global HTTP exception filter.
 * - Attaches correlation/request ID to every error response body
 * - Never exposes stack traces to clients
 * - Logs unexpected 5xx errors with structured context (no secrets)
 */
@Catch()
export class HttpExceptionLoggingFilter implements ExceptionFilter {
  constructor(private readonly logger: AppLoggerService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const requestId = request.requestId;

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const exceptionResponse =
      exception instanceof HttpException ? exception.getResponse() : null;

    let message: string;
    let errorDetail: string | undefined;

    if (typeof exceptionResponse === 'string') {
      message = exceptionResponse;
      errorDetail = HttpStatus[status] ?? 'Error';
    } else if (
      exceptionResponse &&
      typeof exceptionResponse === 'object' &&
      !Array.isArray(exceptionResponse)
    ) {
      const resp = exceptionResponse as Record<string, unknown>;
      message = (resp.message as string) || HttpStatus[status] || 'Error';
      errorDetail = (resp.error as string) || (resp.message as string);
    } else {
      message =
        status === HttpStatus.INTERNAL_SERVER_ERROR
          ? 'Internal server error'
          : 'An error occurred';
      errorDetail = HttpStatus[status] ?? 'Error';
    }

    const body = ApiResponseDto.error(status, message, errorDetail);

    if (requestId) {
      (body as any).requestId = requestId;
    }

    if (status >= 500) {
      const message =
        exception instanceof Error ? exception.message : String(exception);
      this.logger.error(message, exception instanceof Error ? exception.stack : undefined, {
        context: 'HttpException',
        statusCode: status,
        method: request.method,
        path: request.originalUrl ?? request.url,
        requestId,
      });
    }

    response.status(status).json(body);
  }
}
