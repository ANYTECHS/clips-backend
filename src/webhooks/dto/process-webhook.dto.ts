import {
  IsString,
  IsNumber,
  IsOptional,
  IsDateString,
  ValidateNested,
  IsObject,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class WebhookEarningDataDto {
  @ApiProperty({
    description: 'Clip ID to associate the earning with',
    example: 42,
  })
  @IsNumber()
  clipId: number;

  @ApiProperty({ description: 'Earning amount', example: 12.5 })
  @IsNumber()
  amount: number;

  @ApiPropertyOptional({
    description: 'Currency code',
    default: 'USD',
    example: 'USD',
  })
  @IsString()
  @IsOptional()
  currency?: string;

  @ApiProperty({
    description: 'Date of the earning',
    example: '2026-09-27T00:00:00.000Z',
  })
  @IsDateString()
  date: string;

  @ApiPropertyOptional({
    description: 'Platform-specific transaction ID for deduplication',
    example: 'txn_abc123',
  })
  @IsString()
  @IsOptional()
  transactionId?: string;
}

export class ProcessWebhookDto {
  @ApiProperty({ description: 'Webhook event type', example: 'video_earnings' })
  @IsString()
  event_type: string;

  @ApiProperty({
    description: 'Event ID for idempotency',
    example: 'evt_abc123',
  })
  @IsString()
  @IsOptional()
  event_id?: string;

  @ApiPropertyOptional({
    description: 'Webhook event data payload',
    type: WebhookEarningDataDto,
    example: {
      clipId: 42,
      amount: 12.5,
      currency: 'USD',
      date: '2026-09-27T00:00:00.000Z',
      transactionId: 'txn_abc123',
    },
  })
  @IsObject()
  @IsOptional()
  @ValidateNested()
  @Type(() => WebhookEarningDataDto)
  data?: WebhookEarningDataDto;

  @ApiPropertyOptional({
    description: 'Platform-specific HMAC-SHA256 signature',
    example: `sha256=${'a'.repeat(64)}`,
  })
  @IsString()
  @IsOptional()
  signature?: string;
}
