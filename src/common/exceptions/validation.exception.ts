import { HttpException, HttpStatus } from '@nestjs/common';

export class ValidationException extends HttpException {
  constructor(
    message: string = 'Validation failed',
    public readonly errors?: Record<string, string[]>,
  ) {
    super(
      {
        statusCode: HttpStatus.BAD_REQUEST,
        message,
        errors,
        error: 'Validation Error',
      },
      HttpStatus.BAD_REQUEST,
    );
  }
}
