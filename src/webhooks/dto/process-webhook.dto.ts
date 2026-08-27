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
  @ApiProperty({ description: 'Clip ID to associate the earning with' })
  @IsNumber()
  clipId: number;

  @ApiProperty({ description: 'Earning amount' })
  @IsNumber()
  amount: number;

  @ApiPropertyOptional({ description: 'Currency code', default: 'USD' })
  @IsString()
  @IsOptional()
  currency?: string;

  @ApiProperty({ description: 'Date of the earning' })
  @IsDateString()
  date: string;

  @ApiPropertyOptional({
    description: 'Platform-specific transaction ID for deduplication',
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

  @ApiPropertyOptional({ description: 'Webhook event data payload' })
  @IsObject()
  @IsOptional()
  @ValidateNested()
  @Type(() => WebhookEarningDataDto)
  data?: WebhookEarningDataDto;

  @ApiPropertyOptional({ description: 'Platform-specific signature' })
  @IsString()
  @IsOptional()
  signature?: string;
}
