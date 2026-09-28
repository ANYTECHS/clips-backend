import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';

export class LeaderboardQueryDto {
  @ApiPropertyOptional({
    description: 'Page number (1-based)',
    example: 1,
    minimum: 1,
    default: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Page size (default 20, max 100)',
    example: 20,
    minimum: 1,
    maximum: 100,
    default: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({
    description:
      'When true (default), display names and user IDs are anonymized as "Creator #N". ' +
      'Set false to show opted-in creators\' real usernames.',
    example: true,
    default: true,
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return true;
    if (typeof value === 'boolean') return value;
    return value === 'true' || value === '1';
  })
  @IsBoolean()
  anonymize?: boolean = true;

  @ApiPropertyOptional({
    description:
      'When true, earnings amounts are bucketed (anonymized). ' +
      'When false (default), exact earnings totals are returned.',
    example: false,
    default: false,
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return false;
    if (typeof value === 'boolean') return value;
    return value === 'true' || value === '1';
  })
  @IsBoolean()
  anonymizeEarnings?: boolean = false;
}

export class LeaderboardEntryDto {
  @ApiProperty({ example: 1 })
  rank: number;

  @ApiProperty({
    example: null,
    nullable: true,
    description: 'Null when anonymize=true',
  })
  userId: number | null;

  @ApiProperty({
    example: 'Creator #1',
    description: 'Anonymized label or real username depending on anonymize flag',
  })
  displayName: string;

  @ApiProperty({
    example: 5000,
    nullable: true,
    description: 'Exact or bucketed earnings depending on anonymizeEarnings',
  })
  totalEarnings: number | null;

  @ApiProperty({ example: true })
  anonymized: boolean;
}

export class LeaderboardResponseDto {
  @ApiProperty({ type: [LeaderboardEntryDto] })
  data: LeaderboardEntryDto[];

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 20 })
  limit: number;

  @ApiProperty({ example: 42 })
  total: number;

  @ApiProperty({ example: 3 })
  totalPages: number;

  @ApiProperty({ example: true })
  anonymize: boolean;

  @ApiProperty({
    example: true,
    description: 'True when earnings amounts are exact (not bucketed)',
  })
  earningsExact: boolean;

  @ApiProperty({ example: '2026-09-27T21:00:00.000Z' })
  updatedAt: string;
}

export class LeaderboardVisibilityDto {
  @ApiProperty({
    description: 'Opt in (true) or out (false) of the public earnings leaderboard',
    example: true,
  })
  @IsBoolean()
  showOnLeaderboard: boolean;
}
