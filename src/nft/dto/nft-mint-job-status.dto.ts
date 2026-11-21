import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class NftMintJobStatusDto {
  @ApiProperty({
    description: 'Unique BullMQ job ID assigned to this mint job',
    example: 'nft-mint-clip-42',
  })
  jobId: string;

  @ApiProperty({
    description: 'BullMQ internal job state',
    example: 'completed',
    enum: [
      'waiting',
      'active',
      'completed',
      'failed',
      'delayed',
      'prioritized',
      'unknown',
    ],
  })
  state: string;

  @ApiProperty({
    description:
      'High-level NFT mint transaction state: pending (waiting/active/delayed/prioritized), confirmed (mint transaction prepared/complete), failed (error occurred), or unknown',
    example: 'confirmed',
    enum: ['pending', 'confirmed', 'failed', 'unknown'],
  })
  txState: 'pending' | 'confirmed' | 'failed' | 'unknown';

  @ApiProperty({
    description: 'Number of retry attempts executed so far',
    example: 1,
  })
  attemptsMade: number;

  @ApiPropertyOptional({
    description: 'Failure reason if the mint job failed',
    example: 'Soroban RPC timeout after 30s',
    nullable: true,
  })
  failedReason?: string;

  @ApiPropertyOptional({
    description:
      'Result payload produced upon successful completion (e.g. { xdr, clipId })',
    example: { xdr: 'AAAA...', clipId: 42 },
    nullable: true,
  })
  result?: unknown;
}
