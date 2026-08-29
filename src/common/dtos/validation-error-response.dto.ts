import { ApiProperty } from '@nestjs/swagger';

/**
 * Represents a per-field validation failure.
 */
export class ValidationFieldError {
  @ApiProperty({
    description: 'The field that failed validation',
    example: 'email',
  })
  field: string;

  @ApiProperty({
    description: 'List of human-readable validation error messages for this field',
    example: ['Please provide a valid email address'],
    type: [String],
  })
  errors: string[];
}

/**
 * Standardized response body returned by the global ValidationPipe when a
 * request body fails class-validator constraints.
 *
 * HTTP 400 – Bad Request
 *
 * @example
 * {
 *   "statusCode": 400,
 *   "message": "Validation failed",
 *   "error": "Bad Request",
 *   "details": [
 *     { "field": "email", "errors": ["Please provide a valid email address"] },
 *     { "field": "password", "errors": ["Password must be at least 10 characters long"] }
 *   ]
 * }
 */
export class ValidationErrorResponseDto {
  @ApiProperty({ example: 400 })
  statusCode: number;

  @ApiProperty({ example: 'Validation failed' })
  message: string;

  @ApiProperty({ example: 'Bad Request' })
  error: string;

  @ApiProperty({
    description: 'Per-field validation errors',
    type: [ValidationFieldError],
  })
  details: ValidationFieldError[];
}
