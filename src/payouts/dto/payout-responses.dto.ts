import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Exclude } from 'class-transformer';
import {
  PAYOUT_STATUS_SWAGGER_DESCRIPTION,
  PAYOUT_STATUS_VALUES,
} from '../payouts.constants';

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
      'under_review',
      'pending_review',
      'pending_approval',
      'approved',
      'processing',
      'completed',
      'failed',
      'rejected',
      'canceled',
      'cancelled',
    ],
    description:
      'Current payout status. Lifecycle: pending → under_review → approved|rejected → processing → completed|failed',
    enum: PAYOUT_STATUS_VALUES,
    description: PAYOUT_STATUS_SWAGGER_DESCRIPTION,
  })
  status: string;

  @ApiPropertyOptional({
    example: 7,
    description: 'Admin user ID who approved or rejected the payout',
    nullable: true,
  })
  approvedBy?: number | null;

  @ApiPropertyOptional({
    example: 'Insufficient documentation',
    description: 'Rejection reason when status is rejected',
    nullable: true,
  })
  rejectionReason?: string | null;

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

  @ApiProperty({
    example: 'pending',
    enum: ['pending'],
    description:
      'Always `pending` after initiation: the unsigned XDR must be signed and submitted before the payout moves to `processing`.',
  })
  status: string;
}

export class PayoutProcessResponseDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({
    example: 'completed',
    enum: ['completed'],
    description:
      'Always `completed` on success. If submission or verification fails the payout is set to `failed`, a retry is scheduled, and a 500 is returned instead.',
  })
  status: string;

  @ApiPropertyOptional({
    example: 'abcd1234',
    description: 'Internal transaction identifier (hash of the built transaction)',
  })
  transactionId?: string;

  @ApiPropertyOptional({
    example: 'a1b2c3d4e5f6...',
    description: 'Transaction hash returned by Horizon on submission',
  })
  externalTransactionId?: string | null;

  @ApiPropertyOptional({ example: 'a1b2c3d4e5f6...' })
  onChainTxHash?: string;

  @ApiPropertyOptional({
    example: '2026-07-27T12:05:00.000Z',
    description: 'On-chain confirmation time after verification',
  })
  confirmedAt?: Date;
}

export class HorizonTxStatusDto {
  @ApiProperty({
    example: true,
    description: 'Whether the transaction was found on the Stellar network',
  })
  found: boolean;

  @ApiPropertyOptional({
    example: true,
    description:
      'Whether the transaction succeeded on-chain (present when found)',
  })
  successful?: boolean;

  @ApiPropertyOptional({
    example: '2026-07-27T12:05:00.000Z',
    description: 'Ledger close time of the transaction (present when found)',
  })
  confirmedAt?: Date;
}

export class PayoutOnChainStatusResponseDto {
  @ApiProperty({ example: 1, description: 'Payout ID' })
  id: number;

  @ApiProperty({
    example: 'completed',
    enum: ['pending', 'completed', 'failed'],
    description:
      'Payout status. pending = awaiting on-chain confirmation, completed = confirmed on-chain, failed = transaction failed or was not found',
  })
  status: string;

  @ApiProperty({
    example: 'a1b2c3d4e5f6...',
    nullable: true,
    type: String,
    description: 'On-chain Stellar transaction hash',
  })
  onChainTxHash: string | null;

  @ApiProperty({
    example: '2026-07-27T12:05:00.000Z',
    nullable: true,
    type: Date,
    description: 'Time the background verification job confirmed the payout',
  })
  confirmedAt: Date | null;

  @ApiProperty({
    type: HorizonTxStatusDto,
    description: 'Live transaction status queried from Horizon',
  })
  onChain: HorizonTxStatusDto;
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

export class OnChainTransactionStateDto {
  @ApiProperty({
    example: true,
    description: 'Whether Horizon has a record of the transaction yet',
  })
  found: boolean;

  @ApiPropertyOptional({
    example: true,
    description: 'Whether the transaction succeeded on-chain (only set when found)',
  })
  successful?: boolean;

  @ApiPropertyOptional({
    example: '2026-07-27T12:05:00.000Z',
    description: 'Ledger close time reported by Horizon (only set when found)',
  })
  confirmedAt?: Date;
}

export class PayoutOnChainStatusResponseDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({
    example: 'processing',
    enum: PAYOUT_STATUS_VALUES,
    description: PAYOUT_STATUS_SWAGGER_DESCRIPTION,
  })
  status: string;

  @ApiPropertyOptional({ example: 'a1b2c3d4e5f6...', nullable: true })
  onChainTxHash: string | null;

  @ApiPropertyOptional({ example: null, nullable: true })
  confirmedAt: Date | null;

  @ApiProperty({ type: OnChainTransactionStateDto })
  onChain: OnChainTransactionStateDto;
}
