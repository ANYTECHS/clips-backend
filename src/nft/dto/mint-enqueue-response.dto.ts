import { ApiProperty } from '@nestjs/swagger';

export class MintEnqueueResponseDto {
  @ApiProperty({
    description:
      'Deterministic BullMQ job ID assigned to this clip mint request (format: nft-mint-clip-{clipId})',
    example: 'nft-mint-clip-42',
  })
  jobId: string;

  @ApiProperty({
    description:
      'Indicates whether this job was delayed due to queue rate limiting or queue depth overflow protection',
    example: false,
  })
  delayed: boolean;

  @ApiProperty({
    description:
      'Delay in milliseconds applied before worker processing begins (0 if queued immediately)',
    example: 0,
  })
  delayMs: number;
}
