import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsString,
  IsNumber,
  IsOptional,
  Matches,
  Min,
  Max,
  IsInteger,
} from 'class-validator';

/**
 * DTO for setting royalty configuration on a clip
 */
export class SetClipRoyaltyDto {
  @ApiProperty({
    description: 'Stellar wallet address for royalty recipient',
    example: 'GBVP7D2V6DWXYZ...',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^G[A-Z0-9]{55}$/, { message: 'Must be a valid Stellar public key (G...)' })
  recipientAddress!: string;

  @ApiProperty({
    description: 'Royalty basis points (BPS). 100 BPS = 1%, max 1500 BPS = 15%',
    example: 1000,
    minimum: 0,
    maximum: 1500,
  })
  @IsNumber()
  @IsInteger()
  @Min(0)
  @Max(1500)
  basisPoints!: number;

  @ApiPropertyOptional({
    description: 'Platform fee in basis points (optional)',
    example: 500,
    minimum: 0,
  })
  @IsNumber()
  @IsInteger()
  @Min(0)
  @IsOptional()
  platformFeeBps?: number;
}

/**
 * DTO for royalty response
 */
export class ClipRoyaltyResponseDto {
  @ApiProperty({ description: 'Clip ID', example: 123 })
  clipId!: number;

  @ApiProperty({
    description: 'Stellar wallet address receiving royalties',
    example: 'GBVP7D2V6DWXYZ...',
  })
  recipientAddress!: string;

  @ApiProperty({
    description: 'Royalty basis points (100 BPS = 1%)',
    example: 1000,
  })
  basisPoints!: number;

  @ApiProperty({
    description: 'Platform fee in basis points',
    example: 500,
  })
  platformFeeBps!: number;

  @ApiProperty({ description: 'Created timestamp' })
  createdAt!: Date;

  @ApiProperty({ description: 'Last updated timestamp' })
  updatedAt!: Date;
}

/**
 * DTO for royalty calculation response
 */
export class RoyaltyCalculationDto {
  @ApiProperty({
    description: 'Sale price in stroops (smallest Stellar unit)',
    example: 1000000000,
  })
  @IsNumber()
  @IsInteger()
  @Min(0)
  salePrice!: number;

  @ApiProperty({
    description: 'Royalty basis points',
    example: 1000,
  })
  @IsNumber()
  @IsInteger()
  @Min(0)
  @Max(1500)
  basisPoints!: number;
}

/**
 * DTO for royalty calculation response
 */
export class RoyaltyCalculationResponseDto {
  @ApiProperty({ description: 'Sale price', example: 1000000000 })
  salePrice!: number;

  @ApiProperty({ description: 'Royalty basis points', example: 1000 })
  basisPoints!: number;

  @ApiProperty({
    description: 'Calculated royalty amount in stroops',
    example: 100000000,
  })
  royaltyAmount!: number;

  @ApiProperty({
    description: 'Percentage representation',
    example: '10%',
  })
  percentage!: string;
}

/**
 * DTO for updating clip royalty
 */
export class UpdateClipRoyaltyDto {
  @ApiPropertyOptional({
    description: 'Stellar wallet address for royalty recipient',
    example: 'GBVP7D2V6DWXYZ...',
  })
  @IsString()
  @IsOptional()
  @Matches(/^G[A-Z0-9]{55}$/, {
    message: 'Must be a valid Stellar public key (G...)',
  })
  recipientAddress?: string;

  @ApiPropertyOptional({
    description: 'Royalty basis points (BPS). 100 BPS = 1%, max 1500 BPS = 15%',
    example: 1000,
    minimum: 0,
    maximum: 1500,
  })
  @IsNumber()
  @IsInteger()
  @Min(0)
  @Max(1500)
  @IsOptional()
  basisPoints?: number;

  @ApiPropertyOptional({
    description: 'Platform fee in basis points (optional)',
    example: 500,
    minimum: 0,
  })
  @IsNumber()
  @IsInteger()
  @Min(0)
  @IsOptional()
  platformFeeBps?: number;
}
