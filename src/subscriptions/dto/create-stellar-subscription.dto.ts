import { IsString, IsNotEmpty, IsEnum, IsNumber, IsOptional, ValidateIf } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateStellarSubscriptionDto {
  @ApiProperty({ example: 'pro', description: 'Subscription plan identifier' })
  @IsString()
  @IsNotEmpty()
  plan: string;

  @ApiProperty({
    enum: ['xlm', 'usdc', 'custom'],
    description:
      'Payment asset. Use xlm for native XLM, usdc for USDC, or custom for other Stellar assets (provide assetCode + assetIssuer).',
  })
  @IsString()
  @IsEnum(['xlm', 'usdc', 'custom'])
  asset: string;

  @ApiProperty({ example: 10, description: 'Payment amount in the selected asset' })
  @IsNumber()
  @IsNotEmpty()
  amount: number;

  @ApiPropertyOptional({ description: 'Connected Stellar wallet ID' })
  @IsString()
  @IsOptional()
  walletId?: string;

  @ApiPropertyOptional({ description: 'Override destination Stellar address' })
  @IsString()
  @IsOptional()
  destinationAddress?: string;

  @ApiPropertyOptional({ description: 'Payment memo for tracking' })
  @IsString()
  @IsOptional()
  memo?: string;

  @ApiPropertyOptional({
    description: 'Required when asset is custom — Stellar asset code (e.g. EURC)',
    example: 'EURC',
  })
  @ValidateIf((o: CreateStellarSubscriptionDto) => o.asset === 'custom')
  @IsString()
  @IsNotEmpty()
  assetCode?: string;

  @ApiPropertyOptional({
    description: 'Required when asset is custom — issuing account public key',
    example: 'G...',
  })
  @ValidateIf((o: CreateStellarSubscriptionDto) => o.asset === 'custom')
  @IsString()
  @IsNotEmpty()
  assetIssuer?: string;
}

export class StellarPaymentIntentDto {
  id: string;
  amount: number;
  asset: string;
  destination: string;
  memo: string;
  expiresAt: Date;
  status: 'pending' | 'completed' | 'expired';
  assetIssuer?: string | null;
}
