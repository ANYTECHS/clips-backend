import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { PAYOUT_FILTER_STATUSES } from '../payouts.constants';

export class ListPayoutsQueryDto {
  @ApiPropertyOptional({
    description:
      'Filter by payout status. `cancelled` is accepted as an alias of `canceled`.',
    enum: [
      ...PAYOUT_FILTER_STATUSES,
      'cancelled',
      'processing',
      'canceled',
      'under_review',
    ],
    example: 'pending',
  })
  @IsOptional()
  @IsIn(
    [
      ...PAYOUT_FILTER_STATUSES,
      'cancelled',
      'processing',
      'canceled',
      'under_review',
      'pending_retry',
    ],
    { message: 'Invalid payout status filter' },
  )
  status?: string;

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
    description: 'Items per page (max 100)',
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
}
