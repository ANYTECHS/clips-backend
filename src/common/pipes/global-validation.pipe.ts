import {
  BadRequestException,
  ValidationError,
  ValidationPipe,
} from '@nestjs/common';
import { ValidationFieldError } from '../dtos/validation-error-response.dto';

/**
 * Flattens class-validator errors (including nested DTOs and arrays) into
 * `{ field, errors }` entries using dotted paths, e.g. `items.0.clipId`.
 */
export function flattenValidationErrors(
  errors: ValidationError[],
  parentPath = '',
): ValidationFieldError[] {
  return errors.flatMap((error) => {
    const field = parentPath ? `${parentPath}.${error.property}` : error.property;
    const own: ValidationFieldError[] = error.constraints
      ? [{ field, errors: Object.values(error.constraints) }]
      : [];
    const nested = error.children?.length
      ? flattenValidationErrors(error.children, field)
      : [];
    if (!own.length && !nested.length) {
      return [{ field, errors: [`${field} is invalid`] }];
    }
    return [...own, ...nested];
  });
}

export function createGlobalValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    exceptionFactory: (errors) =>
      new BadRequestException({
        statusCode: 400,
        message: 'Validation failed',
        error: 'Bad Request',
        details: flattenValidationErrors(errors),
      }),
  });
}
