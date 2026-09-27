import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayNotEmpty,
  IsArray,
  IsInt,
} from 'class-validator';
import { Type } from 'class-transformer';
import { MAX_BULK_PAYOUT_BATCH_SIZE } from '../payouts.constants';

export class BulkProcessPayoutsDto {
  @ApiProperty({
    description: `Payout IDs to process. Maximum batch size: ${MAX_BULK_PAYOUT_BATCH_SIZE}.`,
    example: [1, 2, 3],
    type: [Number],
    minItems: 1,
    maxItems: MAX_BULK_PAYOUT_BATCH_SIZE,
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_BULK_PAYOUT_BATCH_SIZE, {
    message: `Maximum batch size is ${MAX_BULK_PAYOUT_BATCH_SIZE} payout IDs`,
  })
  @IsInt({ each: true })
  @Type(() => Number)
  payoutIds: number[];
}

export class BulkPayoutItemResultDto {
  @ApiProperty({ example: 1, description: 'Payout ID' })
  id: number;

  @ApiProperty({
    example: 'completed',
    description: 'Processing outcome for this payout',
    enum: ['completed', 'failed'],
  })
  status: string;

  @ApiProperty({
    example: 'Payout must be approved before processing',
    description: 'Error message when status is failed',
    required: false,
  })
  error?: string;
}

export class BulkProcessPayoutsResponseDto {
  @ApiProperty({ example: 2, description: 'Number of successfully processed payouts' })
  processed: number;

  @ApiProperty({ example: 1, description: 'Number of failed payouts' })
  failed: number;

  @ApiProperty({
    type: [BulkPayoutItemResultDto],
    description: 'Per-item results identifying successful and failed payouts',
  })
  results: BulkPayoutItemResultDto[];
}
