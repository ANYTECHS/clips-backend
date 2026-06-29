import { IsString, IsOptional, IsInt, IsArray } from 'class-validator';
import { Transform } from 'class-transformer';
import { IsValidPlatforms } from '../../common/validators/decorators';
import type { SupportedPlatform } from '../../common/validators/is-valid-platform.validator';

export class UpdateVideoDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  sourceType?: string;

  @IsOptional()
  @IsString()
  sourceUrl?: string;

  @IsOptional()
  @IsString()
  thumbnail?: string;

  @IsOptional()
  @IsInt()
  duration?: number;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsArray()
  @IsValidPlatforms({
    message:
      'Invalid targetPlatforms. Must be an array of supported platforms.',
  })
  @Transform(({ value }) => {
    if (!Array.isArray(value)) return value;
    // Normalize: lowercase and dedupe
    const normalized = value.map((p: string) =>
      typeof p === 'string' ? p.toLowerCase() : p,
    );
    return [...new Set(normalized)];
  })
  targetPlatforms?: SupportedPlatform[];
}
