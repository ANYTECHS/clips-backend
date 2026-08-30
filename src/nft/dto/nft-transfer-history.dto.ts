import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class GetNftTransfersQueryDto {
  @ApiPropertyOptional({
    description: 'Maximum number of transfers to return per page (1-100)',
    example: 20,
    default: 20,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({
    description: 'Offset cursor into the transfer list (0-based)',
    example: 0,
    default: 0,
    minimum: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  cursor?: number = 0;
}

export class NftTransferItemDto {
  @ApiProperty({ example: 1 })
  id!: number;

  @ApiProperty({ example: 42, description: 'NFT token ID' })
  tokenId!: number;

  @ApiProperty({
    example: 'GC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3',
    description: 'Sender (previous owner) Stellar address',
  })
  fromAddress!: string;

  @ApiProperty({
    example: 'GBXXYQVNHHZSL3VQNNNQRXB2FHQWZYTQJ6JRYVJL7XP2KXFBH3TFQX',
    description: 'Recipient (new owner) Stellar address',
  })
  toAddress!: string;

  @ApiProperty({
    example: 'a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456',
    description: 'Stellar transaction hash that recorded the transfer',
  })
  txHash!: string;

  @ApiProperty({
    example: '2026-08-29T10:00:00.000Z',
    description: 'On-chain transfer timestamp (ISO-8601)',
  })
  transferredAt!: string;

  @ApiPropertyOptional({
    example: '5000000000',
    description: 'Sale price in stroops when available (null for gifts)',
    nullable: true,
  })
  salePrice!: string | null;
}

export class PaginatedNftTransfersResponseDto {
  @ApiProperty({ example: 42 })
  tokenId!: number;

  @ApiProperty({ type: [NftTransferItemDto] })
  transfers!: NftTransferItemDto[];

  @ApiPropertyOptional({
    example: 20,
    nullable: true,
    description: 'Cursor for the next page. Null when exhausted.',
  })
  nextCursor!: number | null;

  @ApiProperty({ example: 45 })
  total!: number;

  @ApiProperty({ example: 20 })
  limit!: number;

  @ApiProperty({ example: 0 })
  cursor!: number;
}
