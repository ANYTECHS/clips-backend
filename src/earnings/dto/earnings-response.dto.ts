import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EarningsByPlatformResponseDto } from './earnings-by-platform.dto';

export class EarningsBreakdownDto {
  @ApiProperty({ example: 800 })
  royalties: number;

  @ApiProperty({ example: 450.5 })
  subscriptions: number;
}

export class EarningsHistoryItemDto {
  @ApiProperty({ example: '2026-09-26T12:00:00.000Z', format: 'date-time' })
  date: string;

  @ApiProperty({ example: 125.5 })
  amount: number;

  @ApiProperty({ example: 'USD' })
  currency: string;

  @ApiProperty({ enum: ['royalty', 'subscription', 'payout'] })
  type: 'royalty' | 'subscription' | 'payout';
}

export class EarningsSummaryDto {
  @ApiProperty({ example: 1250.5 })
  total: number;

  @ApiProperty({ example: 'USD' })
  currency: string;

  @ApiProperty({ type: EarningsBreakdownDto })
  breakdown: EarningsBreakdownDto;
}

export class EarningsDashboardDto {
  @ApiProperty({ example: 1250.5 })
  totalEarned: number;

  @ApiProperty({ example: 'USD' })
  currency: string;

  @ApiProperty({ example: 50 })
  pendingPayout: number;

  @ApiProperty({ example: 200 })
  paidOut: number;

  @ApiProperty({ type: EarningsBreakdownDto })
  breakdown: EarningsBreakdownDto;

  @ApiProperty({ type: [EarningsHistoryItemDto] })
  history: EarningsHistoryItemDto[];
}

export class EarningsPeriodItemDto {
  @ApiProperty({ example: 42 })
  id: number;

  @ApiProperty({ example: 125.5 })
  amount: number;

  @ApiProperty({ example: 'USD' })
  currency: string;

  @ApiPropertyOptional({ example: 'royalty', nullable: true })
  source: string | null;

  @ApiProperty({ example: '2026-09-26T12:00:00.000Z', format: 'date-time' })
  date: string;

  @ApiPropertyOptional({ example: 'My Clip', nullable: true })
  clipTitle: string | null;
}

export class EarningsPeriodResponseDto {
  @ApiProperty({ example: '2026-09-01T00:00:00.000Z', format: 'date-time' })
  startDate: string;

  @ApiProperty({ example: '2026-09-30T23:59:59.999Z', format: 'date-time' })
  endDate: string;

  @ApiProperty({ example: 1250.5 })
  total: number;

  @ApiProperty({ example: 'USD' })
  currency: string;

  @ApiProperty({ type: EarningsBreakdownDto })
  breakdown: EarningsBreakdownDto;

  @ApiProperty({ type: [EarningsPeriodItemDto] })
  items: EarningsPeriodItemDto[];
}

export { EarningsByPlatformResponseDto };
