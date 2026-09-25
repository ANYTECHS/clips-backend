import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Standard error response body returned by the global exception filter.
 * Used across controllers so Swagger shows one consistent error schema.
 */
export class ErrorResponseDto {
  @ApiProperty({ description: 'HTTP status code', example: 400 })
  statusCode: number;

  @ApiProperty({
    description:
      'Human-readable error message (or list of validation messages)',
    example: 'Invalid request',
    oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
  })
  message: string | string[];

  @ApiProperty({ description: 'HTTP error name', example: 'Bad Request' })
  error: string;

  @ApiPropertyOptional({
    description: 'Correlation ID echoed in the X-Request-Id header',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  requestId?: string;
}
