import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Standard envelope returned for every non-streaming API response.
 *
 * The {@link ResponseInterceptor} automatically wraps plain controller return
 * values in this envelope, so controllers do not need to instantiate it
 * manually unless they want a custom `message`.
 *
 * Issue #854 — standardise API response structure across all controllers.
 */
export class ApiResponseDto<T = any> {
  @ApiProperty({
    description: 'HTTP status code mirrored inside the response body',
    example: 200,
  })
  statusCode: number;

  @ApiProperty({
    description: 'Human-readable result message',
    example: 'Success',
  })
  message: string;

  @ApiPropertyOptional({
    description: 'Response payload. Omitted on error responses.',
  })
  data?: T;

  @ApiPropertyOptional({
    description: 'Error detail. Present only when statusCode >= 400.',
    example: 'Wallet not found',
  })
  error?: string;

  @ApiProperty({
    description: 'ISO-8601 timestamp at which the response was generated',
    example: '2026-08-29T16:50:25.156Z',
  })
  timestamp: string;

  constructor(props: {
    statusCode: number;
    message: string;
    data?: T;
    error?: string;
  }) {
    this.statusCode = props.statusCode;
    this.message = props.message;
    this.data = props.data;
    this.error = props.error;
    this.timestamp = new Date().toISOString();
  }

  /** 200 success wrapper */
  static success<U>(data: U, message: string = 'Success'): ApiResponseDto<U> {
    return new ApiResponseDto({
      statusCode: 200,
      message,
      data,
    });
  }

  /** 201 created wrapper */
  static created<U>(data: U, message: string = 'Created'): ApiResponseDto<U> {
    return new ApiResponseDto({
      statusCode: 201,
      message,
      data,
    });
  }

  /** 4xx / 5xx error wrapper */
  static error(
    statusCode: number,
    message: string,
    error?: string,
  ): ApiResponseDto {
    return new ApiResponseDto({
      statusCode,
      message,
      error: error || message,
    });
  }
}

/**
 * Paginated wrapper for list endpoints.
 *
 * Usage in a controller:
 * ```typescript
 * return new PaginatedResponseDto(items, total, page, limit);
 * ```
 *
 * The {@link ResponseInterceptor} will further wrap this in {@link ApiResponseDto}
 * as the `data` field.
 */
export class PaginatedResponseDto<T> {
  @ApiProperty({ description: 'Array of items on the current page', isArray: true })
  items: T[];

  @ApiProperty({ description: 'Total number of items across all pages', example: 120 })
  total: number;

  @ApiProperty({ description: 'Current page number (1-based)', example: 1 })
  page: number;

  @ApiProperty({ description: 'Number of items per page', example: 20 })
  limit: number;

  @ApiProperty({ description: 'Total number of pages', example: 6 })
  totalPages: number;

  @ApiProperty({ description: 'Whether there is a next page', example: true })
  hasNextPage: boolean;

  @ApiProperty({ description: 'Whether there is a previous page', example: false })
  hasPrevPage: boolean;

  constructor(items: T[], total: number, page: number, limit: number) {
    this.items = items;
    this.total = total;
    this.page = page;
    this.limit = limit;
    this.totalPages = Math.ceil(total / limit);
    this.hasNextPage = page < this.totalPages;
    this.hasPrevPage = page > 1;
  }
}

/**
 * Reusable Swagger schema object describing the standard error response shape.
 * Reference this in `@ApiResponse({ schema: API_ERROR_SCHEMA })` for 400/401/403/404/500.
 */
export const API_ERROR_SCHEMA = {
  type: 'object',
  properties: {
    statusCode: { type: 'number', example: 400 },
    message: { type: 'string', example: 'Validation failed' },
    error: { type: 'string', example: 'Bad Request' },
    timestamp: { type: 'string', example: '2026-08-29T16:50:25.156Z' },
  },
} as const;

/**
 * Helper that builds the Swagger schema for a successful response wrapping a
 * given inline schema in the standard `ApiResponseDto` envelope.
 *
 * @example
 * \@ApiOkResponse({ schema: apiSuccessSchema({ type: 'array', items: { type: 'object' } }) })
 */
export function apiSuccessSchema(dataSchema: Record<string, unknown>) {
  return {
    type: 'object',
    properties: {
      statusCode: { type: 'number', example: 200 },
      message: { type: 'string', example: 'Success' },
      data: dataSchema,
      timestamp: { type: 'string', example: '2026-08-29T16:50:25.156Z' },
    },
  };
}
