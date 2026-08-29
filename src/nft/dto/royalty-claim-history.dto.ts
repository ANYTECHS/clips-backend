import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class RoyaltyClaimHistoryQueryDto {
  @ApiPropertyOptional({ example: 1, default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ example: 20, default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}

export class RoyaltyClaimItemDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 42, description: 'NFT / clip token ID' })
  tokenId: number;

  @ApiProperty({
    example: 'GC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3',
  })
  recipient: string;

  @ApiProperty({
    example: '5000000',
    description: 'Claimed amount in stroops (string for bigint safety)',
  })
  amount: string;

  @ApiPropertyOptional({
    example: 'CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA',
    nullable: true,
  })
  assetContractId: string | null;

  @ApiProperty({
    example: 'a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456',
    description: 'Stellar transaction hash of the claim',
  })
  txHash: string;

  @ApiPropertyOptional({ example: 1234567, nullable: true })
  ledger: number | null;

  @ApiProperty({ example: '2026-08-29T05:00:00.000Z' })
  claimedAt: Date;

  @ApiProperty({ example: '2026-08-29T05:00:01.000Z' })
  createdAt: Date;
}

export class RoyaltyClaimHistoryMetaDto {
  @ApiProperty({ example: 42 })
  total: number;

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 20 })
  limit: number;

  @ApiProperty({ example: 3 })
  totalPages: number;
}

export class RoyaltyClaimHistoryResponseDto {
  @ApiProperty({ type: [RoyaltyClaimItemDto] })
  data: RoyaltyClaimItemDto[];

  @ApiProperty({ type: RoyaltyClaimHistoryMetaDto })
  meta: RoyaltyClaimHistoryMetaDto;
}
