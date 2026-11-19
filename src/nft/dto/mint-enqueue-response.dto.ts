import { ApiProperty } from '@nestjs/swagger';

export class MintEnqueueResponseDto {
  @ApiProperty({ example: 'nft-mint-clip-42' })
  jobId: string;

  @ApiProperty({ example: false })
  delayed: boolean;

  @ApiProperty({ example: 0 })
  delayMs: number;
}
