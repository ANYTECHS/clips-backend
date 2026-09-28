import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * One DailyEarning roll-up row returned by GET /earnings/daily (Issue #979).
 */
export class DailyEarningItemDto {
  @ApiProperty({ example: 1, description: 'DailyEarning row id' })
  id: number;

  @ApiProperty({
    example: '2026-09-26T00:00:00.000Z',
    description: 'Midnight UTC of the aggregated day',
  })
  date: Date;

  @ApiProperty({ example: 'USD', description: 'Currency code' })
  currency: string;

  @ApiProperty({ example: 125.5, description: 'Total amount earned that day' })
  totalAmount: number;

  @ApiPropertyOptional({
    example: 125.5,
    description: 'Total in platform base currency when rates were recorded',
    nullable: true,
  })
  totalInBaseCurrency?: number | null;

  @ApiProperty({ example: 12, description: 'Number of Earning rows folded in' })
  earningCount: number;

  @ApiProperty({ example: 4, description: 'Distinct clips that earned that day' })
  clipCount: number;
}

export class DailyEarningsResponseDto {
  @ApiProperty({ type: [DailyEarningItemDto] })
  items: DailyEarningItemDto[];

  @ApiProperty({
    example: {
      from: '2026-09-01T00:00:00.000Z',
      to: '2026-09-27T00:00:00.000Z',
      currency: 'USD',
    },
    description: 'Applied filters (UTC)',
  })
  filters: {
    from: string | null;
    to: string | null;
    currency: string | null;
  };
}
