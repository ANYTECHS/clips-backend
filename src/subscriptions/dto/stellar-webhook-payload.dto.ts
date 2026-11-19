import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Describes the expected JSON payload for the Stellar payment webhook.
 *
 * The webhook listener accepts `transaction_hash` (or `hash` as a fallback)
 * to identify the on-chain transaction, then fetches the full transaction
 * from Horizon for processing.
 */
export class StellarWebhookPayloadDto {
  @ApiProperty({
    description: 'Stellar transaction hash (primary identifier)',
    example: 'b9d0b229...a1c3',
  })
  transaction_hash: string;

  @ApiPropertyOptional({
    description:
      'Fallback transaction hash field (used when transaction_hash is absent)',
    example: 'b9d0b229...a1c3',
  })
  hash?: string;

  @ApiPropertyOptional({
    description: 'Payment amount in the asset unit',
    example: '15.0000000',
  })
  amount?: string;

  @ApiPropertyOptional({
    description:
      'Asset type (native for XLM, or credit_alphanum4/credit_alphanum12)',
    example: 'native',
    enum: ['native', 'credit_alphanum4', 'credit_alphanum12'],
  })
  asset_type?: string;

  @ApiPropertyOptional({
    description: 'Asset code for non-native assets',
    example: 'USDC',
  })
  asset_code?: string;

  @ApiPropertyOptional({
    description: 'Stellar address of the payment sender',
    example: 'GABC...XYZ',
  })
  from?: string;

  @ApiPropertyOptional({
    description: 'Transaction memo text (used for subscription matching)',
    example: 'CLIPS-42-m1abc-x9z2y',
  })
  memo?: string;
}
