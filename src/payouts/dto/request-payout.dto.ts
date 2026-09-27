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
      'Amount to withdraw. Must meet the minimum payout threshold ' +
      '(default 5 USD equivalent, configurable via MIN_STELLAR_PAYOUT); ' +
      'amounts below the threshold are rejected with a 400 validation error.',
    example: 50,
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
}

/** Alias matching Issue #980 task naming. */
export { CreatePayoutDto as CreatePayoutRequestBodyDto };
