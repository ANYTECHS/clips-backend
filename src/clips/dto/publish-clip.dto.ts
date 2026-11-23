import { IsArray, ArrayNotEmpty, IsOptional, IsIn } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  SUPPORTED_PLATFORMS,
  SupportedPlatform,
} from '../../common/validators/is-valid-platform.validator';
import {
  IsValidPlatforms,
  IsValidSchedule,
} from '../../common/validators/decorators';
import {
  SCHEDULE_MAX_HORIZON_DAYS,
  SCHEDULE_MIN_LEAD_MS,
} from '../../common/validators/is-valid-schedule.validator';

export { SUPPORTED_PLATFORMS };
export type { SupportedPlatform };

export class PublishClipDto {
  @ApiProperty({
    description: 'Target platforms for publishing the clip',
    example: ['tiktok', 'instagram'],
    enum: SUPPORTED_PLATFORMS,
    isArray: true,
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsValidPlatforms()
  @IsIn(SUPPORTED_PLATFORMS, {
    each: true,
    message: `Each platform must be one of: ${SUPPORTED_PLATFORMS.join(', ')}`,
  })
  targetPlatforms: string[];

  @ApiPropertyOptional({
    description:
      'Optional publish time. ISO-8601 date-time with explicit timezone (Z or ±HH:MM), ' +
      `normalised to UTC. Must be at least ${SCHEDULE_MIN_LEAD_MS / 1000}s and at most ` +
      `${SCHEDULE_MAX_HORIZON_DAYS} days in the future. Omit to publish immediately.`,
    type: String,
    format: 'date-time',
    example: '2026-12-01T15:30:00Z',
  })
  @IsOptional()
  @IsValidSchedule()
  scheduledAt?: string;
}
