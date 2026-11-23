import { IsNumber, IsPositive, IsOptional, IsString, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { JobPriorityLevel } from '../../queue/job-priority';

export class CreatePayoutRequestDto {
  @ApiProperty({
    description:
      'Amount to withdraw in USD. Must be at least MIN_PAYOUT (default 5) ' +
      'and no more than MAX_PAYOUT (default 10000).',
    example: 200,
    type: 'number',
  })
  @IsNumber()
  @IsPositive()
  amount: number;

  @ApiPropertyOptional({
    description: 'Payout method ID to use (bank transfer)',
    example: 1,
    type: 'number',
  })
  @IsOptional()
  @IsNumber()
  payoutMethodId?: number;

  @ApiPropertyOptional({
    description: 'Wallet ID to use for Stellar payouts',
    example: 1,
    type: 'number',
  })
  @IsOptional()
  @IsNumber()
  walletId?: number;

  @ApiPropertyOptional({
    description: 'Optional reason for the payout request (admin purposes)',
    example: 'Monthly withdrawal',
    type: 'string',
  })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional({
    description:
      'Optional job priority level for payout processing. ' +
      'Supported values: critical, high, normal, low. ' +
      'Note: critical priority requires administrator privileges.',
    enum: JobPriorityLevel,
    example: JobPriorityLevel.NORMAL,
  })
  @IsOptional()
  @IsEnum(JobPriorityLevel, {
    message: 'priority must be one of: critical, high, normal, low',
  })
  priority?: JobPriorityLevel;
}
