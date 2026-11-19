import { HttpException, HttpStatus } from '@nestjs/common';

export class ConflictException extends HttpException {
  constructor(
    message: string = 'Conflict',
    public readonly code?: string,
  ) {
    super(
      {
        statusCode: HttpStatus.CONFLICT,
        message,
        code,
        error: 'Conflict',
      },
      HttpStatus.CONFLICT,
    );
  }
}
