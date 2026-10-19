import { BadRequestException, ValidationPipe } from '@nestjs/common';

export function createGlobalValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    exceptionFactory: (errors) => {
      const details = errors.map((error) => ({
        field: error.property,
        errors: error.constraints
          ? Object.values(error.constraints)
          : [`${error.property} is invalid`],
      }));
      return new BadRequestException({
        statusCode: 400,
        message: 'Validation failed',
        error: 'Bad Request',
        details,
      });
    },
  });
}