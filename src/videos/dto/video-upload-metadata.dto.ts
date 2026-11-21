import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, IsUrl, Length, MaxLength } from 'class-validator';

export const SUPPORTED_VIDEO_FORMATS = ['mp4', 'mov', 'avi', 'webm'] as const;
export const SUPPORTED_VIDEO_CONTENT_TYPES = [
  'video/mp4',
  'video/quicktime',
  'video/x-msvideo',
  'video/webm',
] as const;
export const VIDEO_TITLE_MAX = 200;
export const VIDEO_DESCRIPTION_MAX = 5000;
export const VIDEO_URL_MAX = 2048;

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** Metadata accompanying a video upload for AI clip generation. */
export class VideoUploadMetadataDto {
  @ApiPropertyOptional({ description: 'Video title', maxLength: VIDEO_TITLE_MAX, example: 'My highlight reel' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, VIDEO_TITLE_MAX)
  title?: string;

  @ApiPropertyOptional({ description: 'Video description', maxLength: VIDEO_DESCRIPTION_MAX })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(VIDEO_DESCRIPTION_MAX)
  description?: string;

  @ApiPropertyOptional({ description: 'Video format', enum: SUPPORTED_VIDEO_FORMATS, example: 'mp4' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase().replace(/^\./, '') : value))
  @IsIn(SUPPORTED_VIDEO_FORMATS, { message: `format must be one of: ${SUPPORTED_VIDEO_FORMATS.join(', ')}` })
  format?: string;

  @ApiPropertyOptional({ description: 'Optional source URL (http/https)', example: 'https://example.com/video.mp4' })
  @IsOptional()
  @Transform(trim)
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true }, { message: 'sourceUrl must be a valid http(s) URL' })
  @MaxLength(VIDEO_URL_MAX)
  sourceUrl?: string;
}
