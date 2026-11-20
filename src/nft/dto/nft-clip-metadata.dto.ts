import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsString, Min, Max, IsOptional } from 'class-validator';

/**
 * ClipCash-specific metadata stored on-chain per token.
 * Includes virality score and other clip-specific information.
 */
export class ClipMetadataDto {
  @ApiProperty({
    description: 'Unique identifier linking to the clip',
    example: '12345',
  })
  @IsString()
  clipId: string;

  @ApiProperty({
    description: 'Virality score (0-100)',
    example: 85,
  })
  @IsNumber()
  @Min(0)
  @Max(100)
  viralityScore: number;

  @ApiProperty({
    description: 'Original duration of the video clip in seconds',
    example: 30,
  })
  @IsNumber()
  @Min(0)
  originalDuration: number;

  @ApiProperty({
    description: 'IPFS or HTTP URI to full metadata',
    example: 'https://ipfs.io/ipfs/QmX...',
    required: false,
  })
  @IsString()
  @IsOptional()
  metadataUri?: string;

  @ApiProperty({
    description: 'Thumbnail URI for preview',
    example: 'https://clips.cash/thumbs/12345.jpg',
    required: false,
  })
  @IsString()
  @IsOptional()
  thumbnailUri?: string;

  @ApiProperty({
    description: 'ISO timestamp of when this metadata was recorded',
    example: '2026-10-18T14:30:00Z',
  })
  @IsString()
  recordedAt: string;
}

/**
 * Response DTO for querying clip metadata by token ID.
 */
export class GetClipMetadataResponseDto {
  @ApiProperty({
    description: 'The token ID',
    example: '12345',
  })
  tokenId: string;

  @ApiProperty({
    description: 'ClipCash-specific metadata',
    type: ClipMetadataDto,
  })
  metadata: ClipMetadataDto;

  @ApiProperty({
    description: 'Contract address this metadata is stored on',
    example: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEU4',
  })
  contractId: string;
}

/**
 * Request DTO for storing ClipCash metadata on-chain.
 */
export class StoreClipMetadataDto {
  @ApiProperty({
    description: 'Unique identifier for the clip',
    example: '12345',
  })
  @IsString()
  clipId: string;

  @ApiProperty({
    description: 'Virality score (0-100)',
    example: 85,
  })
  @IsNumber()
  @Min(0)
  @Max(100)
  viralityScore: number;

  @ApiProperty({
    description: 'Original duration of the video clip in seconds',
    example: 30,
  })
  @IsNumber()
  @Min(0)
  originalDuration: number;

  @ApiProperty({
    description: 'IPFS or HTTP URI to full metadata',
    example: 'https://ipfs.io/ipfs/QmX...',
    required: false,
  })
  @IsString()
  @IsOptional()
  metadataUri?: string;

  @ApiProperty({
    description: 'Thumbnail URI for preview',
    example: 'https://clips.cash/thumbs/12345.jpg',
    required: false,
  })
  @IsString()
  @IsOptional()
  thumbnailUri?: string;
}

/**
 * Response DTO for storing clip metadata.
 */
export class StoreClipMetadataResponseDto {
  @ApiProperty({
    description: 'The token ID where metadata was stored',
    example: '12345',
  })
  tokenId: string;

  @ApiProperty({
    description: 'Whether the storage was successful',
    example: true,
  })
  stored: boolean;

  @ApiProperty({
    description: 'Transaction hash (if on-chain)',
    example: '0x123abc...',
    required: false,
  })
  txHash?: string;

  @ApiProperty({
    description: 'ISO timestamp of storage',
    example: '2026-10-18T14:30:00Z',
  })
  storedAt: string;
}
