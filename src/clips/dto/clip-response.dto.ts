import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ClipResponseDto {
  @ApiProperty({ example: 42, description: 'Clip ID' })
  id: number;

  @ApiProperty({ example: 7, description: 'Source video ID' })
  videoId: number;

  @ApiPropertyOptional({
    example: 'https://res.cloudinary.com/demo/video/upload/v1/clip.mp4',
    description: 'Hosted clip URL',
  })
  clipUrl?: string | null;

  @ApiPropertyOptional({
    example: 'https://res.cloudinary.com/demo/image/upload/v1/thumb.jpg',
    description: 'Hosted clip thumbnail URL',
  })
  thumbnail?: string | null;

  @ApiPropertyOptional({
    example: 88,
    description: 'Heuristic virality score',
  })
  viralityScore?: number | null;

  @ApiProperty({
    example: false,
    description: 'Whether the user has selected the clip for further actions',
  })
  selected: boolean;

  @ApiPropertyOptional({
    example: 1000,
    description: 'NFT royalty in basis points',
  })
  royaltyBps?: number | null;

  @ApiPropertyOptional({
    example: 'CCLIPCONTRACT123456789',
    description:
      'On-chain mint address or token identifier after successful minting',
    nullable: true,
  })
  mintAddress?: string | null;

  @ApiPropertyOptional({
    example: '2026-07-27T12:05:00.000Z',
    description: 'Timestamp when the NFT mint was confirmed on-chain',
    nullable: true,
  })
  mintedAt?: Date | null;

  @ApiProperty({
    example: 'none',
    enum: ['none', 'minting', 'minted', 'failed'],
    description: 'Current NFT mint lifecycle status for the clip',
  })
  nftStatus: 'none' | 'minting' | 'minted' | 'failed';

  @ApiProperty({
    example: '2026-07-27T12:00:00.000Z',
    description: 'Creation timestamp',
  })
  createdAt: Date;

  @ApiProperty({
    example: '2026-07-27T12:05:00.000Z',
    description: 'Last update timestamp',
  })
  updatedAt: Date;
}
