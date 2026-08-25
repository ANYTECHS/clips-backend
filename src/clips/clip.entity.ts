import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Clip entity matching the Prisma schema.
 * Used as a return type for service methods that don't need the full Prisma include set.
 */
export class ClipEntity {
  @ApiProperty({ example: 42 })
  id: number;

  @ApiProperty({ example: 1 })
  videoId: number;

  @ApiProperty({ example: 'https://cdn.example.com/clips/42.mp4' })
  clipUrl: string;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/thumbs/42.jpg' })
  thumbnail: string | null;

  @ApiPropertyOptional({ example: 'youtube' })
  platform: string | null;

  @ApiPropertyOptional({ example: 'Game-winning goal' })
  title: string | null;

  @ApiPropertyOptional({ example: 'Incredible last-second goal' })
  caption: string | null;

  @ApiProperty({ example: 10.5 })
  startTime: number;

  @ApiProperty({ example: 25.8 })
  endTime: number;

  @ApiProperty({ example: 15.3 })
  duration: number;

  @ApiPropertyOptional({ example: 87.5 })
  viralityScore: number | null;

  @ApiPropertyOptional({ example: 1000 })
  royaltyBps: number | null;

  @ApiPropertyOptional()
  postStatus: Record<string, unknown> | null;

  @ApiPropertyOptional()
  postedAt: Date | null;

  @ApiPropertyOptional({
    example: 'ipfs://QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG',
  })
  metadataUri: string | null;

  @ApiPropertyOptional({
    example: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEU4',
  })
  mintAddress: string | null;

  @ApiPropertyOptional()
  mintedAt: Date | null;

  @ApiPropertyOptional({
    example: 'none',
    enum: ['none', 'minting', 'minted', 'failed'],
  })
  nftStatus: string;

  @ApiPropertyOptional({
    example: 'completed',
    enum: ['pending', 'processing', 'completed', 'failed'],
  })
  status: string;

  @ApiPropertyOptional()
  localFilePath: string | null;

  @ApiPropertyOptional()
  error: string | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

/**
 * Subset of Clip fields relevant to NFT minting.
 */
export type ClipNftFields = Pick<
  ClipEntity,
  'id' | 'nftStatus' | 'mintAddress' | 'mintedAt'
>;
