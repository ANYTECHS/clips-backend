import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

/** Supported tracked Soroban / Stellar transaction statuses (Issue #846). */
export enum TransactionStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  FAILED = 'failed',
}

/** POST /transactions/track — begin tracking a submitted transaction. */
export class TrackTransactionDto {
  @ApiProperty({
    description: 'Stellar / Soroban transaction hash to track',
    example: 'a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456',
  })
  @IsString()
  @IsNotEmpty()
  hash!: string;

  @ApiPropertyOptional({
    description: 'Optional label (e.g. mint, approve, set_platform_fee)',
    example: 'mint',
  })
  @IsOptional()
  @IsString()
  label?: string;
}

/** GET /transactions/:hash response (Issue #846). */
export class TransactionStatusResponseDto {
  @ApiProperty({
    example: 'a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456',
  })
  hash!: string;

  @ApiProperty({
    enum: TransactionStatus,
    example: TransactionStatus.CONFIRMED,
    description: 'Latest known status: pending | confirmed | failed',
  })
  status!: TransactionStatus;

  @ApiPropertyOptional({
    example: 'mint',
    description: 'Optional caller-supplied label',
  })
  label?: string | null;

  @ApiPropertyOptional({
    example: '2026-08-29T09:00:00.000Z',
    description: 'When the transaction was first submitted for tracking',
  })
  submittedAt?: string;

  @ApiPropertyOptional({
    example: '2026-08-29T09:00:12.000Z',
    description: 'When the transaction reached a terminal status',
    nullable: true,
  })
  confirmedAt?: string | null;

  @ApiPropertyOptional({
    example: 'tx_failed',
    description: 'Failure reason when status is failed',
    nullable: true,
  })
  failureReason?: string | null;

  @ApiProperty({
    example: '2026-08-29T09:00:15.000Z',
    description: 'Last time the tracker polled the network for this hash',
  })
  lastCheckedAt!: string;
}

/** Example bodies for Swagger success / failure docs. */
export const TRANSACTION_STATUS_SUCCESS_EXAMPLE: TransactionStatusResponseDto = {
  hash: 'a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456',
  status: TransactionStatus.CONFIRMED,
  label: 'mint',
  submittedAt: '2026-08-29T09:00:00.000Z',
  confirmedAt: '2026-08-29T09:00:12.000Z',
  failureReason: null,
  lastCheckedAt: '2026-08-29T09:00:12.000Z',
};

export const TRANSACTION_STATUS_FAILURE_EXAMPLE: TransactionStatusResponseDto = {
  hash: 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
  status: TransactionStatus.FAILED,
  label: 'approve',
  submittedAt: '2026-08-29T09:00:00.000Z',
  confirmedAt: '2026-08-29T09:00:08.000Z',
  failureReason: 'Transaction unsuccessful on Horizon',
  lastCheckedAt: '2026-08-29T09:00:08.000Z',
};

export const TRANSACTION_STATUS_PENDING_EXAMPLE: TransactionStatusResponseDto = {
  hash: 'pendinghashpendinghashpendinghashpendinghashpendinghashpending00',
  status: TransactionStatus.PENDING,
  label: 'set_platform_fee',
  submittedAt: '2026-08-29T09:00:00.000Z',
  confirmedAt: null,
  failureReason: null,
  lastCheckedAt: '2026-08-29T09:00:05.000Z',
};
