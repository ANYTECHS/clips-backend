import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsString, Min, Max } from 'class-validator';

/**
 * Request DTO for setting royalties on an NFT.
 * Supports configurable basis points (BPS) for secondary sales.
 */
export class SetRoyaltyDto {
  @ApiProperty({
    description: 'The token ID to set royalty for',
    example: '12345',
  })
  @IsString()
  tokenId: string;

  @ApiProperty({
    description: 'Royalty recipient wallet address',
    example: 'GBKRDQ5EOPBJQFTBKYZX4AYJVHGCQGXD7UPFMZUWBNYH3FQNVGPG3ZVY',
  })
  @IsString()
  recipient: string;

  @ApiProperty({
    description: 'Royalty percentage in basis points (100 = 1%, max 1500 = 15%)',
    example: 1000,
  })
  @IsNumber()
  @Min(0)
  @Max(10000)
  basisPoints: number;
}

/**
 * Response DTO for royalty configuration.
 */
export class RoyaltyConfigResponseDto {
  @ApiProperty({
    description: 'The token ID',
    example: '12345',
  })
  tokenId: string;

  @ApiProperty({
    description: 'Royalty recipient wallet address',
    example: 'GBKRDQ5EOPBJQFTBKYZX4AYJVHGCQGXD7UPFMZUWBNYH3FQNVGPG3ZVY',
  })
  recipient: string;

  @ApiProperty({
    description: 'Royalty percentage in basis points',
    example: 1000,
  })
  basisPoints: number;

  @ApiProperty({
    description: 'Human-readable percentage (e.g., "10%")',
    example: '10%',
  })
  percentage: string;

  @ApiProperty({
    description: 'Whether this is the primary royalty recipient',
    example: true,
  })
  isPrimary: boolean;
}

/**
 * Response DTO for royalty summary.
 */
export class RoyaltySummaryResponseDto {
  @ApiProperty({
    description: 'The token ID',
    example: '12345',
  })
  tokenId: string;

  @ApiProperty({
    description: 'Primary royalty recipient',
    type: RoyaltyConfigResponseDto,
  })
  primary: RoyaltyConfigResponseDto;

  @ApiProperty({
    description: 'Secondary royalty recipients (platform fees, etc)',
    type: [RoyaltyConfigResponseDto],
    isArray: true,
  })
  secondary: RoyaltyConfigResponseDto[];

  @ApiProperty({
    description: 'Total royalty basis points',
    example: 1500,
  })
  totalBasisPoints: number;

  @ApiProperty({
    description: 'Whether total royalties exceed max allowed (1500 BPS)',
    example: false,
  })
  exceedsMaxRoyalty: boolean;
}
