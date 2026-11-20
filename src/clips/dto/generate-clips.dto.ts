import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  Validate,
} from 'class-validator';

/** Issue #1360 — clip generation settings. */
export const CLIP_STYLES = ['viral', 'educational', 'funny', 'highlight', 'storytelling'] as const;
export const CLIP_LANGUAGES = ['auto', 'en', 'es', 'fr', 'de', 'pt', 'it', 'nl', 'ja', 'ko', 'zh', 'hi', 'ar'] as const;
export type ClipStyle = (typeof CLIP_STYLES)[number];
export type ClipLanguage = (typeof CLIP_LANGUAGES)[number];

export const CLIP_DURATION_MIN_SEC = 5;
export const CLIP_DURATION_MAX_SEC = 180;
export const CLIP_COUNT_MAX = 20;

@ValidatorConstraint({ name: 'clipDurationRange', async: false })
class ClipDurationRangeConstraint implements ValidatorConstraintInterface {
  validate(max: number, args: ValidationArguments) {
    const min = (args.object as ClipGenerationSettingsDto).minDuration ?? 15;
    return typeof max !== 'number' || max >= min;
  }
  defaultMessage() {
    return 'maxDuration must be greater than or equal to minDuration';
  }
}

export class ClipGenerationSettingsDto {
  @ApiPropertyOptional({ description: 'Minimum clip length (seconds)', minimum: CLIP_DURATION_MIN_SEC, maximum: CLIP_DURATION_MAX_SEC, default: 15, example: 15 })
  @IsOptional()
  @IsInt()
  @Min(CLIP_DURATION_MIN_SEC)
  @Max(CLIP_DURATION_MAX_SEC)
  minDuration: number = 15;

  @ApiPropertyOptional({ description: 'Maximum clip length (seconds); must be >= minDuration', minimum: CLIP_DURATION_MIN_SEC, maximum: CLIP_DURATION_MAX_SEC, default: 60, example: 60 })
  @IsOptional()
  @IsInt()
  @Min(CLIP_DURATION_MIN_SEC)
  @Max(CLIP_DURATION_MAX_SEC)
  @Validate(ClipDurationRangeConstraint)
  maxDuration: number = 60;

  @ApiPropertyOptional({ description: 'Clip style', enum: CLIP_STYLES, default: 'viral' })
  @IsOptional()
  @IsIn(CLIP_STYLES)
  style: ClipStyle = 'viral';

  @ApiPropertyOptional({ description: 'Number of clips to generate', minimum: 1, maximum: CLIP_COUNT_MAX, default: 5, example: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(CLIP_COUNT_MAX)
  clipCount: number = 5;

  @ApiPropertyOptional({ description: 'Caption/transcript language', enum: CLIP_LANGUAGES, default: 'auto' })
  @IsOptional()
  @IsIn(CLIP_LANGUAGES)
  language: ClipLanguage = 'auto';
}

export class GenerateClipsDto {
  @ApiPropertyOptional({ description: 'Video ID to generate clips from', example: '42' })
  @IsString()
  videoId: string;

  @ApiPropertyOptional({
    description: 'Clip generation settings (defaults applied when omitted)',
    type: ClipGenerationSettingsDto,
    example: { minDuration: 15, maxDuration: 60, style: 'viral', clipCount: 5, language: 'en' },
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => ClipGenerationSettingsDto)
  settings: ClipGenerationSettingsDto = new ClipGenerationSettingsDto();
}
