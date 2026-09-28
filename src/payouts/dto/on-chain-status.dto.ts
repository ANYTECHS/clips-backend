import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class OnChainDetailsDto {
  @ApiProperty({ example: true, description: 'Whether the tx was found on Horizon' })
  found: boolean;

  @ApiPropertyOptional({
    example: true,
    description: 'Whether the on-chain transaction succeeded',
  })
  successful?: boolean;

  @ApiPropertyOptional({
    example: '2026-07-26T12:05:00.000Z',
    description: 'Horizon confirmation timestamp',
  })
  confirmedAt?: Date | string | null;

  @ApiPropertyOptional({
    example: 'GABCDEF...',
    description: 'Payment destination address from the on-chain operation',
  })
  destination?: string;

  @ApiPropertyOptional({
    example: 100.5,
    description: 'Transferred amount from the on-chain payment operation',
  })
  transferredAmount?: number;
}

export class OnChainStatusResponseDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({
    example: 'completed',
    description: 'Updated payout status after verification',
  })
  status: string;

  @ApiPropertyOptional({
    example: 'a1b2c3d4e5f6...',
    description: 'Stored on-chain Stellar transaction hash',
    nullable: true,
  })
  onChainTxHash?: string | null;

  @ApiPropertyOptional({
    example: '2026-07-26T12:05:00.000Z',
    description: 'Timestamp when the payout was confirmed on-chain',
    nullable: true,
  })
  confirmedAt?: Date | string | null;

  @ApiProperty({ type: OnChainDetailsDto })
  onChain: OnChainDetailsDto;
}
