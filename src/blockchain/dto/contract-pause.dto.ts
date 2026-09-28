import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

// ---------------------------------------------------------------------------
// Request DTOs
// ---------------------------------------------------------------------------

export class SchedulePauseDto {
  /**
   * Stellar address of the admin requesting the pause.
   * Must match the ADMIN_STELLAR_ADDRESS environment variable.
   */
  @ApiProperty({
    example: 'GDQRBQZQYL6K5V2XJZ7ZQZQZQZQZQZQZQZQZQZQZQZQZQZQZQZQZQZQZ',
    description: 'Admin Stellar public key authorizing the pause request',
  })
  @IsString()
  @IsNotEmpty()
  adminAddress: string;

  @ApiPropertyOptional({
    example: 'Suspected exploit — freezing contract for investigation',
    description: 'Optional human-readable reason for the pause',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class CancelPauseDto {
  @ApiProperty({
    example: 'GDQRBQZQYL6K5V2XJZ7ZQZQZQZQZQZQZQZQZQZQZQZQZQZQZQZQZQZQZ',
    description: 'Admin Stellar public key cancelling the pause request',
  })
  @IsString()
  @IsNotEmpty()
  adminAddress: string;
}

// ---------------------------------------------------------------------------
// Response DTOs
// ---------------------------------------------------------------------------

export class ContractPauseStatusDto {
  @ApiProperty({
    example: false,
    description: 'Whether the contract is currently paused',
  })
  isPaused: boolean;

  @ApiProperty({
    example: false,
    description:
      'Whether there is a pending pause scheduled but not yet active',
  })
  hasPendingPause: boolean;

  @ApiPropertyOptional({
    example: '2026-09-29T20:22:19.137Z',
    nullable: true,
    description: 'ISO-8601 timestamp of when the pause was requested',
  })
  requestedAt: string | null;

  @ApiPropertyOptional({
    example: '2026-09-30T20:22:19.137Z',
    nullable: true,
    description:
      'ISO-8601 timestamp when the 24-hour timelock expires and the pause becomes active',
  })
  scheduledFor: string | null;

  @ApiPropertyOptional({
    example: '2026-09-30T21:00:00.000Z',
    nullable: true,
    description: 'ISO-8601 timestamp when the pause was activated on-chain',
  })
  activatedAt: string | null;

  @ApiPropertyOptional({
    example: null,
    nullable: true,
    description:
      'ISO-8601 timestamp when the pending pause was cancelled (null if not cancelled)',
  })
  cancelledAt: string | null;

  @ApiPropertyOptional({
    example: 'Suspected exploit',
    nullable: true,
    description: 'Reason provided when the pause was scheduled',
  })
  reason: string | null;

  @ApiPropertyOptional({
    example: 'GDQRBQZQYL6K5V2XJZ7ZQZQZQZQZQZQZQZQZQZQZQZQZQZQZQZQZQZQZ',
    nullable: true,
    description: 'Admin address that requested the pause',
  })
  requestedBy: string | null;
}
