import { IsNumber, IsString, IsEnum, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/** @deprecated Use CreatePayoutDto */
export type RequestPayoutDto = CreatePayoutDto;

export class CreatePayoutDto {
  @ApiProperty({
    description: 'Amount to withdraw',
    example: 100.0,
    minimum: 0.01,
  })
  @IsNumber()
  @Min(0.01)
  amount: number;

  @ApiProperty({
    description: 'Currency code',
    example: 'USD',
  })
  @IsString()
  currency: string;

  @ApiProperty({
    description: 'Payout method',
    enum: ['fiat', 'stellar'],
    example: 'stellar',
  })
  @IsEnum(['fiat', 'stellar'])
  method: 'fiat' | 'stellar';
}
