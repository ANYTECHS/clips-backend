import { IsNumber, IsPositive, IsOptional, IsString, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PartialPayoutRequestDto {
  @ApiProperty({
    description: 'Amount to withdraw in USD',
    example: 200,
    type: 'number',
    minimum: 0.01,
  })
  @IsNumber()
  @IsPositive()
  @Min(0.01, { message: 'Minimum payout amount is $0.01' })
  amount: number;

  @ApiPropertyOptional({
    description: 'Payout method ID for bank transfer',
    example: 1,
    type: 'number',
  })
  @IsOptional()
  @IsNumber()
  payoutMethodId?: number;

  @ApiPropertyOptional({
    description: 'Wallet ID for Stellar payout',
    example: 1,
    type: 'number',
  })
  @IsOptional()
  @IsNumber()
  walletId?: number;

  @ApiPropertyOptional({
    description: 'Optional reason for the payout request',
    example: 'Monthly withdrawal',
    type: 'string',
  })
  @IsOptional()
  @IsString()
  reason?: string;
}
