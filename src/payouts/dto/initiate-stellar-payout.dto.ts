import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsNumber, Min } from 'class-validator';

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
  @IsNumber()
  @Min(0.01)
  amount: number;
}
