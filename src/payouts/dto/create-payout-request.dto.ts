import { IsNumber, IsPositive, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatePayoutRequestDto {
  @ApiProperty({
    description: 'Amount to withdraw in USD',
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
}
