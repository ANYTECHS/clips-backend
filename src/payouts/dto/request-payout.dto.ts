import { Type } from 'class-transformer';
import { IsNumber, IsString, IsEnum, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { TrimString } from '../../common/decorators/trim-string.decorator';

/** @deprecated Use CreatePayoutDto */
export type RequestPayoutDto = CreatePayoutDto;

export class CreatePayoutDto {
  @ApiProperty({
    description: 'Amount to withdraw',
    example: 100.0,
    minimum: 0.01,
  })
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount: number;

  @ApiProperty({
    description: 'Currency code',
    example: 'USD',
  })
  @TrimString()
  @IsString()
  currency: string;

  @ApiProperty({
    description: 'Payout method',
    enum: ['fiat', 'stellar'],
    example: 'stellar',
  })
  @TrimString()
  @IsEnum(['fiat', 'stellar'])
  method: 'fiat' | 'stellar';
}
