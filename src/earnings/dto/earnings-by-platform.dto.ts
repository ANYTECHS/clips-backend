import { ApiProperty } from '@nestjs/swagger';

export class PlatformEarningDto {
  @ApiProperty({ example: 'tiktok', description: 'Source platform (earning.source, fallback unknown)' })
  platform: string;

  @ApiProperty({ example: 125.5, description: 'Total converted amount for the platform in the target currency. Currencies are never mixed: each earning is converted explicitly before summing.' })
  amount: number;

  @ApiProperty({ example: 'USD', enum: ['USD', 'EUR', 'GBP', 'XLM', 'USDC'], description: 'Target currency. Supported: USD, EUR, GBP, XLM, USDC.' })
  currency: string;

  @ApiProperty({ example: 125.5, description: 'Alias of amount for backwards compatibility' })
  totalEarnings: number;

  @ApiProperty({ example: 12, description: 'Number of earning records for the platform' })
  count: number;
}

export class EarningsByPlatformResponseDto {
  @ApiProperty({ type: [PlatformEarningDto], description: 'Chart-ready per-platform breakdown' })
  data: PlatformEarningDto[];

  @ApiProperty({ example: 250.75, description: 'Sum across platforms in the target currency' })
  totalEarnings: number;

  @ApiProperty({ example: 'USD', enum: ['USD', 'EUR', 'GBP', 'XLM', 'USDC'] })
  currency: string;
}

/** @deprecated Prefer PlatformEarningDto */
export type PlatformEarning = PlatformEarningDto;

/** @deprecated Prefer EarningsByPlatformResponseDto */
export type EarningsByPlatformResponse = EarningsByPlatformResponseDto;
