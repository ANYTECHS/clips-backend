import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Body for PATCH /clips/:id/royalty-bps
 *
 * Issue #747: Allow creators to configure a custom royalty percentage
 * (0–15%) per clip before minting as an NFT. When not provided the
 * field defaults to 1000 bps (10%) as set in the Prisma schema.
 */
export class SetRoyaltyBpsDto {
  /**
   * Royalty in basis points (0–1500 = 0–15%).
   * Defaults to 1000 (10%) when omitted or null.
   */
  @ApiProperty({
    description:
      'Creator royalty in basis points (BPS). 100 BPS = 1%. ' +
      'Allowed range: 0–1500 (0–15%). Defaults to 1000 (10%) when omitted.',
    example: 1000,
    minimum: 0,
    maximum: 1500,
    required: false,
  })
  @IsOptional()
  @IsInt()
  @Min(0, { message: 'royaltyBps must be at least 0' })
  @Max(1500, { message: 'royaltyBps must not exceed 1500 (15%)' })
  @Type(() => Number)
  royaltyBps?: number;
}

export class SetRoyaltyBpsResponseDto {
  @ApiProperty({ description: 'Clip ID', example: 42 })
  clipId: number;

  @ApiProperty({
    description: 'Stored royalty in basis points',
    example: 1000,
  })
  royaltyBps: number;
}
