import { HttpException, HttpStatus } from '@nestjs/common';

export interface AuthErrorOptions {
  message: string;
  errorCode: string;
  reason?: string;
}

export function throwUnauthorized(opts: AuthErrorOptions): never {
  throw new HttpException(
    {
      statusCode: HttpStatus.UNAUTHORIZED,
      errorCode: opts.errorCode,
      message: opts.message,
      ...(opts.reason !== undefined && { reason: opts.reason }),
    },
    HttpStatus.UNAUTHORIZED,
  );
}

export function throwForbidden(opts: AuthErrorOptions): never {
  throw new HttpException(
    {
      statusCode: HttpStatus.FORBIDDEN,
      errorCode: opts.errorCode,
      message: opts.message,
      ...(opts.reason !== undefined && { reason: opts.reason }),
    },
    HttpStatus.FORBIDDEN,
  );
}
