import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TrimString } from '../../common/decorators/trim-string.decorator';
import {
  IsSupportedCurrency,
  CURRENCY_API_PROPERTY,
} from '../../common/validators/decorators';
import { JobPriorityLevel } from '../../queue/job-priority';

/** @deprecated Use CreatePayoutDto */
export type RequestPayoutDto = CreatePayoutDto;

/**
 * One destination in a fiat/crypto split payout (Issue #981).
 */
export class PayoutDestinationDto {
  @ApiProperty({
    description: 'Destination payout method',
    enum: ['fiat', 'stellar'],
    example: 'fiat',
  })
  @TrimString()
  @IsEnum(['fiat', 'stellar'], {
    message: 'method must be one of: fiat, stellar',
  })
  method: 'fiat' | 'stellar';

  @ApiPropertyOptional({
    description:
      'Percentage of the total amount allocated to this destination (0–100). ' +
      'All destination percentages must sum to 100.',
    example: 70,
    minimum: 0.01,
    maximum: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'percentage must be a valid number' })
  @Min(0.01, { message: 'percentage must be at least 0.01' })
  @Max(100, { message: 'percentage cannot exceed 100' })
  percentage?: number;

  @ApiPropertyOptional({
    description:
      'Absolute amount for this destination. When used, destination amounts ' +
      'must sum to the request amount.',
    example: 70,
    minimum: 0.01,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'amount must be a valid number' })
  @Min(0.01, { message: 'amount must be at least 0.01' })
  amount?: number;
}

/**
 * Body for POST /payouts/request (Issues #980 / #981).
 * Also exported as CreatePayoutRequestDto for Swagger naming consistency.
 */
export class CreatePayoutDto {
  @ApiProperty({
    description:
      'Amount to withdraw. Must be within the configured min/max payout limits ' +
      'for the currency (defaults: MIN_PAYOUT_USD=5, MAX_PAYOUT_USD=10000; ' +
      'per-currency via MIN_PAYOUT_<CCY>/MAX_PAYOUT_<CCY> or PAYOUT_LIMITS JSON). ' +
      'Amounts outside the range are rejected with a 400 validation error.',
    example: 100.0,
    minimum: 0.01,
  })
  @Type(() => Number)
  @IsNumber({}, { message: 'amount must be a valid number' })
  @Min(0.01, { message: 'amount must be at least 0.01' })
  amount: number;

  @ApiProperty({
    ...CURRENCY_API_PROPERTY,
    description:
      'ISO 4217 currency code. Supported: USD, EUR, GBP, XLM, USDC. ' +
      'Payout limits apply per-currency (defaults: MIN_PAYOUT_USD=5, ' +
      'MAX_PAYOUT_USD=10000; override via MIN_PAYOUT_<CCY>/MAX_PAYOUT_<CCY> ' +
      'or PAYOUT_LIMITS JSON). Amounts outside the range are rejected with a ' +
      '400 validation error.',
    example: 'USD',
  })
  @TrimString()
  @IsString({ message: 'currency must be a string' })
  @IsNotEmpty({ message: 'currency is required' })
  @IsSupportedCurrency()
  currency: string;

  @ApiPropertyOptional({
    description:
      'Primary payout method when not using a destinations split. ' +
      '"fiat" for bank transfers, "stellar" for XLM payouts. Required when ' +
      '`destinations` is omitted.',
    enum: ['fiat', 'stellar'],
    example: 'stellar',
  })
  @IsOptional()
  @TrimString()
  @IsEnum(['fiat', 'stellar'], {
    message: 'method must be one of: fiat, stellar',
  })
  method?: 'fiat' | 'stellar';

  @ApiPropertyOptional({
    description:
      'Optional split across multiple payout destinations (fiat and/or stellar). ' +
      'Percentages must sum to 100, or absolute amounts must sum to `amount`.',
    type: [PayoutDestinationDto],
    example: [
      { method: 'fiat', percentage: 70 },
      { method: 'stellar', percentage: 30 },
    ],
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PayoutDestinationDto)
  destinations?: PayoutDestinationDto[];

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

/** Alias matching Issue #980 / #1278 task naming. */
export { CreatePayoutDto as CreatePayoutRequestBodyDto };
export { CreatePayoutRequestDto } from './create-payout-request.dto';
