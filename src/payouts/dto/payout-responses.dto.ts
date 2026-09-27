import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Exclude } from 'class-transformer';

export class PayoutResponseDto {
  @ApiProperty({ example: 1, description: 'Payout ID' })
  id: number;

  @ApiProperty({
    example: 100.5,
    description: 'Gross payout amount before fees',
  })
  amount: number;

  @ApiPropertyOptional({
    example: 2,
    description:
      'Platform/withdrawal fee deducted from the gross amount. ' +
      'Fees are calculated from PayoutFeeConfig for the payout method ' +
      '(fixed, percentage, or combined) and stored when the payout is created.',
  })
  fee?: number | null;

  @ApiPropertyOptional({
    example: 2,
    description: 'Alias of fee (persisted as feeAmount)',
  })
  feeAmount?: number | null;

  @ApiPropertyOptional({
    example: 98.5,
    description: 'Net amount the user receives after fees (amount - fee)',
  })
  netAmount?: number | null;

  @ApiPropertyOptional({
    example: 98.5,
    description: 'Alias of netAmount (persisted as finalAmount)',
  })
  finalAmount?: number | null;

  @ApiProperty({ example: 'USD', description: 'Currency code' })
  currency: string;

  @ApiProperty({
    example: 'stellar',
    enum: ['fiat', 'stellar'],
    description: 'Payout method',
  })
  method: string;

  @ApiProperty({
    example: 'pending',
    enum: [
      'pending',
      'pending_review',
      'pending_approval',
      'approved',
      'processing',
      'completed',
      'failed',
      'rejected',
      'canceled',
    ],
    description: 'Current payout status',
  })
  status: string;

  @ApiPropertyOptional({
    example: 'a1b2c3d4e5f6...',
    description: 'On-chain Stellar transaction hash when available',
  })
  onChainTxHash?: string | null;

  @ApiPropertyOptional({
    example: '2026-07-26T12:05:00.000Z',
    description: 'Timestamp when the transaction was confirmed on Horizon',
  })
  confirmedAt?: Date | null;

  @ApiPropertyOptional({
    example: 'abcd1234',
    description:
      'Deterministic internal transaction identifier for payout processing',
  })
  transactionId?: string | null;

  @ApiPropertyOptional({
    example: 'AAAAAgAAAADh1...',
    description: 'Unsigned Stellar transaction XDR awaiting client signature',
  })
  stellarXdr?: string | null;

  @ApiProperty({
    example: '2026-07-27T12:00:00.000Z',
    description: 'Creation timestamp',
  })
  createdAt: Date;
}

export class StellarPayoutInitiationResponseDto {
  @ApiProperty({ example: 1, description: 'Payout ID' })
  id: number;

  @ApiProperty({ example: 100, description: 'Pending payout amount' })
  amount: number;

  @ApiProperty({
    example: 'abcd1234',
    description: 'Internal transaction identifier for payout tracking',
  })
  transactionId: string;

  @ApiProperty({
    example: 'AAAAAgAAAADh1...',
    description: 'Unsigned Stellar transaction XDR for client signing',
  })
  stellarXdr: string;

  @ApiProperty({ example: 'pending', description: 'Updated payout status' })
  status: string;
}

export class PayoutProcessResponseDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'completed' })
  status: string;

  @ApiPropertyOptional({ example: 'a1b2c3d4e5f6...' })
  onChainTxHash?: string;

  @ApiPropertyOptional({
    example: '2026-07-27T12:05:00.000Z',
    description: 'On-chain confirmation time after verification',
  })
  confirmedAt?: Date;
}

export class RejectPayoutDto {
  @ApiPropertyOptional({
    description: 'Reason for rejecting the payout',
    example: 'Insufficient documentation',
  })
  reason?: string;
}

/**
 * Fee preview response — same shape whether shown before confirmation
 * or returned on a created payout.
 *
 * @example
 * { "amount": 100, "fee": 2, "netAmount": 98, "currency": "USD" }
 */
export class FeePreviewResponseDto {
  @ApiProperty({ example: 100, description: 'Gross payout amount' })
  amount: number;

  @ApiProperty({ example: 100, description: 'Gross payout amount (alias)' })
  grossAmount: number;

  @ApiProperty({ example: 2, description: 'Fee charged for this payout method' })
  fee: number;

  @ApiProperty({ example: 2, description: 'Fee amount (alias)' })
  feeAmount: number;

  @ApiProperty({ example: 2, description: 'Configured fee percentage when applicable' })
  feePercentage: number;

  @ApiProperty({ example: 98, description: 'Net amount after fees' })
  netAmount: number;

  @ApiProperty({ example: 98, description: 'Net amount (alias)' })
  finalAmount: number;

  @ApiProperty({ example: 'USD' })
  currency: string;
}

export class PayoutMethodResponseDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'bank_transfer' })
  type: string;

  @ApiProperty({ example: true })
  isDefault: boolean;

  @ApiPropertyOptional({ example: 'Chase Bank' })
  bankName?: string | null;

  @ApiPropertyOptional({ example: 'John Doe' })
  accountHolderName?: string | null;

  @ApiPropertyOptional({ example: 'US' })
  country?: string | null;

  @ApiProperty({ example: 'USD' })
  currency: string;

  @ApiPropertyOptional({ example: '1234' })
  lastFourDigits?: string | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  @Exclude()
  encryptedAccountNumber?: string | null;

  @Exclude()
  encryptedRoutingNumber?: string | null;

  @Exclude()
  encryptedSwiftCode?: string | null;

  @Exclude()
  encryptedIban?: string | null;
}
