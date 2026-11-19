import { HttpException, HttpStatus } from '@nestjs/common';

export class BadRequestException extends HttpException {
  constructor(
    message: string = 'Bad request',
    public readonly code?: string,
  ) {
    super(
      {
        statusCode: HttpStatus.BAD_REQUEST,
        message,
        code,
        error: 'Bad Request',
      },
      HttpStatus.BAD_REQUEST,
    );
  }
}
