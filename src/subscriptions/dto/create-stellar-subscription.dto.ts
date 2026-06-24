import { IsString, IsNotEmpty, IsEnum, IsNumber, IsOptional } from 'class-validator';

export class CreateStellarSubscriptionDto {
  @IsString()
  @IsNotEmpty()
  plan: string;

  @IsString()
  @IsEnum(['xlm', 'usdc', 'custom'])
  asset: string;

  @IsNumber()
  @IsNotEmpty()
  amount: number;

  @IsString()
  @IsOptional()
  walletId?: string;

  @IsString()
  @IsOptional()
  destinationAddress?: string;

  @IsString()
  @IsOptional()
  memo?: string;
}

export class StellarPaymentIntentDto {
  id: string;
  amount: number;
  asset: string;
  destination: string;
  memo: string;
  expiresAt: Date;
  status: 'pending' | 'completed' | 'expired';
}
