import { IsArray, ArrayNotEmpty, IsString } from 'class-validator';

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
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  targetPlatforms: string[];
}
