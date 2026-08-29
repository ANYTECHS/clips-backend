import { Type } from 'class-transformer';
import { IsNumber, IsString, IsEnum, Min, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { TrimString } from '../../common/decorators/trim-string.decorator';

/** @deprecated Use CreatePayoutDto */
export type RequestPayoutDto = CreatePayoutDto;

export class CreatePayoutDto {
  @ApiProperty({
    description:
      'Amount to withdraw. Must meet the minimum payout threshold ' +
      '(default 5 USD equivalent, configurable via MIN_STELLAR_PAYOUT); ' +
      'amounts below the threshold are rejected with a 400 validation error.',
    example: 100.0,
    minimum: 0.01,
  })
  @Type(() => Number)
  @IsNumber({}, { message: 'amount must be a valid number' })
  @Min(0.01, { message: 'amount must be at least 0.01' })
  amount: number;

  @ApiProperty({
    description: 'ISO 4217 currency code (e.g. USD, XLM)',
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
