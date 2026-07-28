import { IsString, IsOptional, IsInt, IsArray } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsValidPlatforms } from '../../common/validators/decorators';
import type { SupportedPlatform } from '../../common/validators/is-valid-platform.validator';

export class CreateVideoDto {
  @ApiProperty({ description: 'Owner user ID', example: 1 })
  @IsInt()
  userId: number;

  @ApiPropertyOptional({
    description: 'Video title',
    example: 'My highlight reel',
  })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({
    description: 'Video description',
    example: 'Best moments from last week',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    description: 'Source type',
    example: 'upload',
    enum: ['upload', 'url', 'stream'],
  })
  @IsOptional()
  @IsString()
  sourceType?: string;

  @ApiPropertyOptional({
    description: 'Source URL when not uploading a file',
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
    example: 120,
  })
  @IsOptional()
  @IsInt()
  duration?: number;

  @ApiPropertyOptional({
    description: 'Target social platforms',
    example: ['tiktok', 'instagram'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsValidPlatforms({
    message: 'Invalid platform(s). Must be an array of supported platforms.',
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
