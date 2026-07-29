import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Successful on-chain royalty query response. */
export class RoyaltyQueryResponseDto {
  @ApiProperty({
    description: 'Royalty fee in basis points (1000 = 10%)',
    example: 1000,
    minimum: 0,
    maximum: 10000,
  })
  royaltyBps!: number;

  @ApiProperty({
    description: 'Masked Stellar account that receives royalty payments',
    example: 'GABC********NOQRS',
  })
  recipient!: string;

  @ApiPropertyOptional({
    description: 'Decimal precision for sub-unit royalty calculations (7 decimals for Stellar assets / XLM)',
    example: 7,
    default: 7,
  })
  assetDecimals?: number;

  @ApiPropertyOptional({
    description: 'Example fractional royalty calculation for 10 XLM (100,000,000 stroops at 500 BPS = 5,000,000 stroops = 0.5 XLM)',
    example: '0.5000000',
  })
  fractionalExample?: string;
}

/** 404 body when royalty data cannot be resolved for the mint address. */
export class RoyaltyNotFoundDto {
  @ApiProperty({ example: 404 })
  statusCode!: number;

  @ApiProperty({
    example: 'Royalty data not found for mint address 42',
  })
  message!: string;

  @ApiProperty({ example: 'Not Found' })
  error!: string;
}

/** 401 body when the request is missing a valid session / bearer token. */
export class RoyaltyUnauthorizedDto {
  @ApiProperty({ example: 401 })
  statusCode!: number;

  @ApiProperty({ example: 'Unauthorized' })
  message!: string;
}
