import { HttpException, HttpStatus } from '@nestjs/common';

export class ServiceUnavailableException extends HttpException {
  constructor(
    message: string = 'Service temporarily unavailable',
    public readonly serviceName?: string,
  ) {
    super(
      {
        statusCode: HttpStatus.SERVICE_UNAVAILABLE,
        message,
        service: serviceName,
        error: 'Service Unavailable',
      },
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }
}
