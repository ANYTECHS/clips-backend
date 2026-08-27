import { ApiProperty } from '@nestjs/swagger';

export class PlatformEarningDto {
  @ApiProperty({ example: 'tiktok', description: 'Social platform name' })
  platform: string;

  @ApiProperty({ example: 125.5, description: 'Total earnings for the platform' })
  totalEarnings: number;

  @ApiProperty({ example: 12, description: 'Number of earning records' })
  count: number;
}

export class EarningsByPlatformResponseDto {
  @ApiProperty({ type: [PlatformEarningDto] })
  data: PlatformEarningDto[];

  @ApiProperty({ example: 250.75, description: 'Sum of earnings across platforms' })
  totalEarnings: number;
}

/** @deprecated Prefer PlatformEarningDto */
export type PlatformEarning = PlatformEarningDto;

/** @deprecated Prefer EarningsByPlatformResponseDto */
export type EarningsByPlatformResponse = EarningsByPlatformResponseDto;
