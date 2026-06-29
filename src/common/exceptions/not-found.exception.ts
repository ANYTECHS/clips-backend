import { HttpException, HttpStatus } from '@nestjs/common';

export class NotFoundException extends HttpException {
  constructor(
    message: string = 'Resource not found',
    public readonly resourceType?: string,
    public readonly resourceId?: string | number,
  ) {
    super(
      {
        statusCode: HttpStatus.NOT_FOUND,
        message,
        resourceType,
        resourceId,
        error: 'Not Found',
      },
      HttpStatus.NOT_FOUND,
    );
  }
}
