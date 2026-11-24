import { Type } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { JobPriorityLevel } from '../../queue/job-priority';
import { TrimString } from '../../common/decorators/trim-string.decorator';
import {
  IsSupportedCurrency,
  CURRENCY_API_PROPERTY,
} from '../../common/validators/decorators';

/**
 * DTO for creating a payout request (Issue #1278).
 * Accepts amount, currency, and payout method ('fiat' or 'stellar').
 */
export class CreatePayoutRequestDto {
  @ApiProperty({
    description:
      'Amount to withdraw. Must be at least the configured minimum (default 5 USD equivalent) ' +
      'and no more than the configured maximum (default 10000 USD equivalent).',
    example: 50,
    type: 'number',
    minimum: 0.01,
  })
  @Type(() => Number)
  @IsNumber({}, { message: 'amount must be a valid number' })
  @IsPositive({ message: 'amount must be a positive number' })
  @Min(0.01, { message: 'amount must be at least 0.01' })
  amount: number;

  @ApiProperty({
    ...CURRENCY_API_PROPERTY,
    description:
      'ISO 4217 currency code. Supported: USD, EUR, GBP, XLM, USDC.',
    example: 'USD',
  })
  @TrimString()
  @IsString({ message: 'currency must be a string' })
  @IsNotEmpty({ message: 'currency is required' })
  @IsSupportedCurrency()
  currency: string = 'USD';

  @ApiProperty({
    description:
      'Payout method to use ("fiat" for bank transfer, "stellar" for Stellar crypto payout)',
    enum: ['fiat', 'stellar'],
    example: 'stellar',
  })
  @TrimString()
  @IsEnum(['fiat', 'stellar'], {
    message: 'method must be one of: fiat, stellar',
  })
  method: 'fiat' | 'stellar';

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
