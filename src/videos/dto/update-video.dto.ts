import { IsString, IsOptional, IsInt, IsArray } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsValidPlatforms } from '../../common/validators/decorators';
import type { SupportedPlatform } from '../../common/validators/is-valid-platform.validator';

export class UpdateVideoDto {
  @ApiPropertyOptional({
    description: 'Video title',
    example: 'Updated title',
  })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({
    description: 'Video description',
    example: 'Updated description',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    description: 'Source type',
    example: 'upload',
  })
  @IsOptional()
  @IsString()
  sourceType?: string;

  @ApiPropertyOptional({
    description: 'Source URL',
    example: 'https://cdn.example.com/videos/abc.mp4',
  })
  @IsOptional()
  @IsString()
  sourceUrl?: string;

  @ApiPropertyOptional({
    description: 'Thumbnail URL',
    example: 'https://cdn.example.com/thumbs/abc.jpg',
  })
  @IsOptional()
  @IsString()
  thumbnail?: string;

  @ApiPropertyOptional({
    description: 'Duration in seconds',
    example: 90,
  })
  @IsOptional()
  @IsInt()
  duration?: number;

  @ApiPropertyOptional({
    description: 'Processing status',
    example: 'ready',
    enum: ['pending', 'processing', 'ready', 'failed'],
  })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({
    description: 'Target social platforms',
    example: ['youtube', 'tiktok'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsValidPlatforms({
    message:
      'Invalid targetPlatforms. Must be an array of supported platforms.',
  })
  @Transform(({ value }) => {
    if (!Array.isArray(value)) return value;
    const normalized = value.map((p: string) =>
      typeof p === 'string' ? p.toLowerCase() : p,
    );
    return [...new Set(normalized)];
  })
  targetPlatforms?: SupportedPlatform[];
}
