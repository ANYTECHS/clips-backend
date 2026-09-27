import { Type } from 'class-transformer';
import { IsNumber, IsString, IsEnum, Min, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { TrimString } from '../../common/decorators/trim-string.decorator';

/** @deprecated Use CreatePayoutDto */
export type RequestPayoutDto = CreatePayoutDto;

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
    description:
      'ISO 4217 currency code. Supported currencies with default limits: USD ' +
      '(and any currency configured via MIN_PAYOUT_*/MAX_PAYOUT_* or PAYOUT_LIMITS).',
    example: 'USD',
  })
  @TrimString()
  @IsString({ message: 'currency must be a string' })
  @IsNotEmpty({ message: 'currency is required' })
  currency: string;

  @ApiProperty({
    description: 'Payout method — "fiat" for bank transfers, "stellar" for XLM payouts',
    enum: ['fiat', 'stellar'],
    example: 'stellar',
  })
  @TrimString()
  @IsEnum(['fiat', 'stellar'], {
    message: 'method must be one of: fiat, stellar',
  })
  method: 'fiat' | 'stellar';
}
