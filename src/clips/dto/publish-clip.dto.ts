import { IsArray, ArrayNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export const SUPPORTED_PLATFORMS = [
  'tiktok',
  'instagram',
  'youtube',
  'facebook',
  'twitter',
  'snapchat',
  'pinterest',
  'linkedin',
] as const;

export type SupportedPlatform = (typeof SUPPORTED_PLATFORMS)[number];

export class PublishClipDto {
  @ApiProperty({
    description: 'Target platforms for publishing the clip',
    example: ['tiktok', 'instagram'],
    enum: SUPPORTED_PLATFORMS,
    isArray: true,
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  targetPlatforms: string[];
}
