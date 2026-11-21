import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class MonthlyEarningDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 1 })
  userId: number;

  @ApiProperty({ example: 2026 })
  year: number;

  @ApiProperty({ example: 9 })
  month: number;

  @ApiProperty({ example: 1250.5 })
  totalAmount: number;

  @ApiProperty({ example: 'USD', description: 'ISO 4217 currency code' })
  currency: string;

  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'number' },
    example: { royalty: 800, subscription: 450.5 },
  })
  platformBreakdown: Record<string, number>;

  @ApiProperty({ example: true })
  generated: boolean;
}

export class MonthlyEarningsFiltersDto {
  @ApiProperty({ example: 2026 })
  year: number;

  @ApiProperty({ example: 9 })
  month: number;

  @ApiPropertyOptional({ example: 'USD', nullable: true })
  currency: string | null;
}

export class MonthlyEarningsResponseDto {
  @ApiProperty({ type: [MonthlyEarningDto] })
  summaries: MonthlyEarningDto[];

  @ApiProperty({ type: MonthlyEarningsFiltersDto })
  filters: MonthlyEarningsFiltersDto;
}
