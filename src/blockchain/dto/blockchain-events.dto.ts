import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class BlockchainEventsQueryDto {
  @ApiPropertyOptional({
    example: 'Mint',
    description:
      'Filter by event type: Mint, Transfer, RoyaltyPaid, Burn, RoyaltyClaimed',
  })
  @IsOptional()
  @IsString()
  type?: string;

  @ApiPropertyOptional({ example: 42 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  tokenId?: number;

  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ example: 20, default: 20, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}

export class BlockchainEventItemDto {
  @ApiProperty({ example: 'clxyz123' })
  id: string;

  @ApiProperty({ example: 'Mint' })
  eventType: string;

  @ApiPropertyOptional({ example: 42, nullable: true })
  tokenId: number | null;

  @ApiPropertyOptional({
    example: 'GC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3',
    nullable: true,
  })
  fromAddress: string | null;

  @ApiPropertyOptional({
    example: 'GDQRBQZQYL6K5V2XJZ7ZQZQZQZQZQZQZQZQZQZQZQZQZQZQZQZQZQZQZ',
    nullable: true,
  })
  toAddress: string | null;

  @ApiPropertyOptional({
    example: '5000000',
    nullable: true,
    description: 'Amount in stroops when applicable',
  })
  amount: string | null;

  @ApiPropertyOptional({ example: 'native', nullable: true })
  asset: string | null;

  @ApiProperty({
    example: 'a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456',
  })
  txHash: string;

  @ApiProperty({ example: 0 })
  eventIndex: number;

  @ApiProperty({ example: 1234567 })
  ledger: number;

  @ApiPropertyOptional({ nullable: true })
  payload: Record<string, unknown> | null;

  @ApiProperty({ example: '2026-08-29T05:00:00.000Z' })
  createdAt: Date;
}

export class BlockchainEventsMetaDto {
  @ApiProperty({ example: 100 })
  total: number;

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 20 })
  limit: number;

  @ApiProperty({ example: 5 })
  totalPages: number;
}

export class BlockchainEventsResponseDto {
  @ApiProperty({ type: [BlockchainEventItemDto] })
  data: BlockchainEventItemDto[];

  @ApiProperty({ type: BlockchainEventsMetaDto })
  meta: BlockchainEventsMetaDto;
}
