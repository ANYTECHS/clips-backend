import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Currency } from '../earnings.types';

export class MonthlyEarningsQueryDto {
  @ApiProperty({
    description: 'Calendar year in UTC',
    example: 2026,
    minimum: 2000,
    maximum: 2100,
  })
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  year: number;

  @ApiProperty({
    description: 'Calendar month in UTC (1-12)',
    example: 9,
    minimum: 1,
    maximum: 12,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month: number;

  @ApiPropertyOptional({
    description: 'Filter results to one native earning currency',
    enum: Currency,
    example: Currency.USD,
  })
  @IsOptional()
  @IsEnum(Currency)
  currency?: Currency;
}

export class MonthlyEarningSummaryDto {
  @ApiProperty({
    description:
      'Total earned in this currency; currencies are not converted or combined',
    example: 1250.5,
  })
  totalAmount: number;

  @ApiProperty({
    description: 'Native currency code for totalAmount',
    enum: Currency,
    example: Currency.USD,
  })
  currency: Currency;

  @ApiProperty({
    description: 'Earnings total by clip platform in the same currency',
    example: { tiktok: 800, youtube: 450.5 },
    type: Object,
  })
  platformBreakdown: Record<string, number>;
}

export class MonthlyEarningsResponseDto {
  @ApiProperty({ example: 42 })
  userId: number;

  @ApiProperty({ example: 2026 })
  year: number;

  @ApiProperty({ example: 9 })
  month: number;

  @ApiProperty({
    type: [MonthlyEarningSummaryDto],
    description:
      'One summary per currency; amounts in different currencies are never added together',
  })
  items: MonthlyEarningSummaryDto[];

  @ApiProperty({
    description:
      'True when the result came from persisted monthly summaries; false when computed from earnings',
    example: true,
  })
  generated: boolean;
}
