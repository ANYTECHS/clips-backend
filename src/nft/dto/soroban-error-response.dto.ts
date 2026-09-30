import { ApiProperty } from '@nestjs/swagger';

/**
 * Standard API error shape returned when a Soroban contract error is mapped to
 * an HTTP response (Issue #1056).
 */
export class SorobanContractErrorResponseDto {
  @ApiProperty({
    example: 403,
    description: 'HTTP status code derived from the contract error variant.',
  })
  statusCode!: number;

  @ApiProperty({
    example: 'Unauthorized',
    description: 'Contract error variant name.',
  })
  contractError!: string;

  @ApiProperty({
    example: 'Caller is not authorised to perform this operation.',
    description: 'Human-readable explanation of the error.',
  })
  message!: string;

  @ApiProperty({
    example: '2026-09-29T19:23:09.864Z',
    description: 'ISO-8601 timestamp of the error.',
  })
  timestamp!: string;
}
