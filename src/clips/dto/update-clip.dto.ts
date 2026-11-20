import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { TrimString } from '../../common/decorators/trim-string.decorator';

/**
 * Issue #1361 — validated clip update payload.
 * Only the properties below are accepted; the global ValidationPipe
 * (whitelist + forbidNonWhitelisted) rejects protected fields such as
 * id, videoId, clipUrl, mintAddress, nftStatus, royaltyBps, status → HTTP 400.
 */
export const CLIP_VISIBILITIES = ['public', 'unlisted', 'private'] as const;
export type ClipVisibility = (typeof CLIP_VISIBILITIES)[number];

@ValidatorConstraint({ name: 'clipMetadata', async: false })
class ClipMetadataConstraint implements ValidatorConstraintInterface {
  validate(value: unknown) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const entries = Object.entries(value);
    return (
      entries.length <= 20 &&
      entries.every(
        ([k, v]) =>
          k.length <= 50 &&
          (typeof v === 'number' || typeof v === 'boolean' || (typeof v === 'string' && v.length <= 500)),
      )
    );
  }
  defaultMessage() {
    return 'metadata must be a flat object with at most 20 keys (key ≤ 50 chars; values string ≤ 500 chars, number or boolean)';
  }
}

export class UpdateClipDto {
  @ApiPropertyOptional({ description: 'Clip title', minLength: 1, maxLength: 100, example: 'Epic comeback' })
  @IsOptional()
  @TrimString()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  title?: string;

  @ApiPropertyOptional({ description: 'Clip description', maxLength: 2000 })
  @IsOptional()
  @TrimString()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ description: 'Caption text for social posts', maxLength: 2200 })
  @IsOptional()
  @TrimString()
  @IsString()
  @MaxLength(2200)
  caption?: string;

  @ApiPropertyOptional({ description: 'Clip visibility', enum: CLIP_VISIBILITIES })
  @IsOptional()
  @IsIn(CLIP_VISIBILITIES)
  visibility?: ClipVisibility;

  @ApiPropertyOptional({
    description: 'Optional flat key/value metadata',
    type: 'object',
    additionalProperties: { oneOf: [{ type: 'string' }, { type: 'number' }, { type: 'boolean' }] },
    example: { game: 'valorant', featured: true },
  })
  @IsOptional()
  @IsObject()
  @Validate(ClipMetadataConstraint)
  metadata?: Record<string, string | number | boolean>;
}
