import { applyDecorators } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiExtraModels,
  ApiForbiddenResponse,
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
  getSchemaPath,
} from '@nestjs/swagger';
import { ErrorResponseDto } from '../dtos/error-response.dto';

const errorSchema = (statusCode: number, message: string, error: string) => ({
  allOf: [{ $ref: getSchemaPath(ErrorResponseDto) }],
  example: { statusCode, message, error },
});

export const STANDARD_ERRORS = {
  400: ApiBadRequestResponse({
    description: 'Bad Request — invalid input or failed validation',
    schema: errorSchema(400, 'Invalid request', 'Bad Request'),
  }),
  401: ApiUnauthorizedResponse({
    description: 'Unauthorized — missing or invalid JWT',
    schema: errorSchema(401, 'Unauthorized', 'Unauthorized'),
  }),
  403: ApiForbiddenResponse({
    description: 'Forbidden — authenticated but not permitted',
    schema: errorSchema(403, 'Forbidden resource', 'Forbidden'),
  }),
  404: ApiNotFoundResponse({
    description: 'Not Found — resource does not exist',
    schema: errorSchema(404, 'Resource not found', 'Not Found'),
  }),
  409: ApiConflictResponse({
    description: 'Conflict — request conflicts with current state',
    schema: errorSchema(409, 'Resource already exists', 'Conflict'),
  }),
  429: ApiTooManyRequestsResponse({
    description: 'Too Many Requests — rate limit exceeded',
    schema: errorSchema(
      429,
      'ThrottlerException: Too Many Requests',
      'Too Many Requests',
    ),
  }),
  500: ApiInternalServerErrorResponse({
    description: 'Internal Server Error',
    schema: errorSchema(500, 'Internal server error', 'Internal Server Error'),
  }),
} as const;

export type StandardErrorStatus = keyof typeof STANDARD_ERRORS;

/**
 * Applies consistent Swagger error responses using the shared ErrorResponseDto.
 * Defaults to 400, 401, 403, 429 and 500 when no statuses are given.
 *
 * @example
 * \@ApiStandardErrors()            // common set
 * \@ApiStandardErrors(404, 409)    // specific statuses
 */
export function ApiStandardErrors(...statuses: StandardErrorStatus[]) {
  const selected: StandardErrorStatus[] = statuses.length
    ? statuses
    : [400, 401, 403, 429, 500];
  return applyDecorators(
    ApiExtraModels(ErrorResponseDto),
    ...selected.map((s) => STANDARD_ERRORS[s]),
  );
}
