import { HttpException, HttpStatus } from '@nestjs/common';

export class UnauthorizedException extends HttpException {
  constructor(
    message: string = 'Unauthorized',
    public readonly reason?: string,
  ) {
    super(
      {
        statusCode: HttpStatus.UNAUTHORIZED,
        message,
        reason,
        error: 'Unauthorized',
      },
      HttpStatus.UNAUTHORIZED,
    );
  }
}
