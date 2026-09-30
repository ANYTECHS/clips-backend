import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class NftCollectionResponseDto {
  @ApiProperty({
    example: 'viral-clips',
    description: 'Stable collection slug',
  })
  collectionId!: string;

  @ApiProperty({ example: 'Viral Clips' })
  name!: string;

  @ApiProperty({ example: 'Short-form clips selected for viral potential.' })
  description!: string;

  @ApiProperty({ enum: ['viral', 'podcast', 'comedy', 'educational'] })
  type!: string;

  @ApiProperty({
    description:
      'Collection-specific metadata, stored separately from token metadata',
    example: { category: 'viral', schemaVersion: 1 },
  })
  metadata!: Record<string, unknown>;

  @ApiPropertyOptional({
    description: 'Collection default royalty in basis points',
    example: 1000,
    nullable: true,
  })
  royaltyBps!: number | null;

  @ApiPropertyOptional({
    description: 'Maximum permitted minted supply',
    example: 10000,
    nullable: true,
  })
  maxSupply!: number | null;

  @ApiProperty({
    description: 'Current live supply for this collection',
    example: 25,
  })
  supply!: number;
}

export class NftCollectionTokenResponseDto {
  @ApiProperty({ example: 42 })
  id!: number;

  @ApiProperty({ example: 'viral-clips' })
  collectionId!: string;

  @ApiProperty({ example: 'A moment worth replaying' })
  title!: string | null;

  @ApiProperty({ example: 'ipfs://bafy...' })
  metadataUri!: string | null;

  @ApiProperty({ example: '42' })
  mintAddress!: string;

  @ApiProperty({ example: '2026-09-28T12:00:00.000Z' })
  mintedAt!: Date | null;
}
