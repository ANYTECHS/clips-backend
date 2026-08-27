import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsNumber,
  IsOptional,
  ValidateIf,
} from 'class-validator';
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

  @ApiProperty({
    example: 10,
    description: 'Payment amount in the selected asset',
  })
  @IsNumber()
  @IsNotEmpty()
  amount: number;

  @ApiPropertyOptional({
    description: 'Connected Stellar wallet ID',
    example: 'wallet_abc123',
  })
  @IsString()
  @IsOptional()
  walletId?: string;

  @ApiPropertyOptional({
    description: 'Override destination Stellar address',
    example: 'GC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3',
  })
  @IsString()
  @IsOptional()
  destinationAddress?: string;

  @ApiPropertyOptional({
    description: 'Payment memo for tracking',
    example: 'sub-pro-2026-07',
  })
  @IsString()
  @IsOptional()
  memo?: string;

  @ApiPropertyOptional({
    description:
      'Required when asset is custom — Stellar asset code (e.g. EURC)',
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
  @ApiProperty({ description: 'Payment intent ID', example: 'pi_01HXYZ' })
  id: string;

  @ApiProperty({ description: 'Payment amount in the selected asset', example: 10 })
  amount: number;

  @ApiProperty({ description: 'Payment asset (xlm, usdc, custom)', example: 'xlm', enum: ['xlm', 'usdc', 'custom'] })
  asset: string;

  @ApiProperty({ description: 'Stellar destination address', example: 'GC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3' })
  destination: string;

  @ApiProperty({ description: 'Payment memo for tracking', example: 'sub-pro-2026-07' })
  memo: string;

  @ApiProperty({ description: 'Expiration date and time', example: '2026-07-26T13:00:00.000Z' })
  expiresAt: Date;

  @ApiProperty({
    description: 'Payment intent status',
    enum: ['pending', 'completed', 'expired'],
    example: 'pending',
  })
  status: 'pending' | 'completed' | 'expired';

  @ApiPropertyOptional({
    description: 'Asset issuer when using a custom Stellar asset',
    example: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
  })
  assetIssuer?: string | null;
}
