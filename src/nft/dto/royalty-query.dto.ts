import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';
import {
  IsValidRoyaltyBps,
  CLIP_ROYALTY_BPS_MAX,
} from '../../common/validators/decorators';

/** Query params for GET /nfts/royalty/estimate (Issue #680). */
export class RoyaltyEstimateQueryDto {
  @ApiProperty({
    description: 'Sale price in stroops (1 XLM = 10,000,000 stroops) to estimate the royalty on',
    example: 100_000_000,
    minimum: 0,
  })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  salePrice!: number;

  @ApiPropertyOptional({
    description:
      'Royalty rate in basis points (100 = 1%) to apply. Defaults to the configured creator royalty rate when omitted.',
    example: 1000,
    minimum: 0,
    maximum: CLIP_ROYALTY_BPS_MAX,
  })
  @IsOptional()
  @Type(() => Number)
  @IsValidRoyaltyBps({ max: CLIP_ROYALTY_BPS_MAX })
  royaltyBps?: number;
}

/** Response for GET /nfts/royalty/estimate (Issue #680 / #836). */
export class RoyaltyEstimateResponseDto {
  @ApiProperty({
    description: 'Sale price in stroops the estimate was computed from',
    example: 100_000_000,
  })
  salePrice!: number;

  @ApiProperty({
    description: 'Royalty rate applied, in basis points (100 = 1%)',
    example: 1000,
  })
  royaltyBps!: number;

  @ApiProperty({
    description:
      'Royalty amount owed in stroops, rounded down to the nearest stroop ' +
      '(checked: floor(salePrice × royaltyBps / 10_000) via BigInt safe math)',
    example: 10_000_000,
  })
  royaltyAmount!: number;
}

/**
 * 400 body when royalty inputs are unsupported or would overflow (Issue #836).
 * Returned when salePrice/royaltyBps are invalid, or when the checked product
 * exceeds Number.MAX_SAFE_INTEGER.
 */
export class RoyaltyOverflowErrorDto {
  @ApiProperty({ example: 400 })
  statusCode!: number;

  @ApiProperty({
    example:
      'Royalty amount (13510798882111486500) exceeds Number.MAX_SAFE_INTEGER. salePrice=9007199254740991, royaltyBps=1500.',
    description:
      'Validation / overflow message from checkedRoyaltyAmount. Extreme values that ' +
      'would lose IEEE-754 precision are rejected rather than silently corrupted.',
  })
  message!: string;

  @ApiProperty({ example: 'Bad Request' })
  error!: string;
}

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
