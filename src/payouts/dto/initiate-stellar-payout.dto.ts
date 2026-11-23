import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsNumber, IsOptional, Min } from 'class-validator';
import { JobPriorityLevel } from '../../queue/job-priority';

export class InitiateStellarPayoutDto {
  @ApiProperty({
    description: 'Payout record ID',
    example: 1,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  payoutId: number;

  @ApiProperty({
    description: 'Payout amount to initiate',
    example: 100,
    minimum: 0.01,
  })
  @Type(() => Number)
  @IsNumber(
    { maxDecimalPlaces: 7 },
    { message: 'amount must be a valid number with at most 7 decimal places' },
  )
  @Min(0.01)
  amount: number;

  @ApiPropertyOptional({
    description:
      'Optional job priority level for payout processing. ' +
      'Supported values: critical, high, normal, low. ' +
      'Note: critical priority requires administrator privileges.',
    enum: JobPriorityLevel,
    example: JobPriorityLevel.HIGH,
  })
  @IsOptional()
  @IsEnum(JobPriorityLevel, {
    message: 'priority must be one of: critical, high, normal, low',
  })
  priority?: JobPriorityLevel;
}
