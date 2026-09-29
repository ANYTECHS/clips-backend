import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Compact response for POST /payouts/request (Issue #980).
 */
export class PayoutRequestResponseDto {
  @ApiProperty({
    example: 'payout_123',
    description: 'Public payout request identifier',
  })
  payoutId: string;

  @ApiProperty({
    example: 'pending',
    description: 'Initial payout status',
  })
  status: string;

  @ApiPropertyOptional({
    example: 123,
    description: 'Numeric database id (same record as payoutId)',
  })
  id?: number;

  @ApiPropertyOptional({ example: 50 })
  amount?: number;

  @ApiPropertyOptional({ example: 'USD' })
  currency?: string;

  @ApiPropertyOptional({ example: 'stellar' })
  method?: string;
}

/**
 * Response when a split payout creates multiple records (Issue #981).
 */
export class SplitPayoutRequestResponseDto {
  @ApiProperty({ type: [PayoutRequestResponseDto] })
  payouts: PayoutRequestResponseDto[];

  @ApiProperty({
    example: 100,
    description: 'Total amount requested across all destinations',
  })
  totalAmount: number;

  @ApiProperty({ example: 'USD' })
  currency: string;
}
