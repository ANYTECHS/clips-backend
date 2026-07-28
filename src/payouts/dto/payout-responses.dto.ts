import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Exclude } from 'class-transformer';

export class PayoutResponseDto {
  @ApiProperty({ example: 1, description: 'Payout ID' })
  id: number;

  @ApiProperty({ example: 100.5, description: 'Payout amount' })
  amount: number;

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
