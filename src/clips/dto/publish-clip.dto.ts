import { IsArray, ArrayNotEmpty, IsIn } from 'class-validator';
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
  @IsArray({ message: 'targetPlatforms must be an array of platform names' })
  @ArrayNotEmpty({ message: 'Select at least one platform to publish to' })
  @IsIn(SUPPORTED_PLATFORMS, {
    each: true,
    message: `Each platform must be one of: ${SUPPORTED_PLATFORMS.join(', ')}`,
  })
  targetPlatforms: string[];
}
