import { ApiProperty } from '@nestjs/swagger';

export class SorobanPauseInfoDto {
  @ApiProperty({ example: true, description: 'Whether the contract is paused' })
  paused: boolean;

  @ApiProperty({
    example: 'Scheduled contract maintenance',
    description: 'Human-readable pause reason, or an empty string if unset',
  })
  reason: string;
}

export class SorobanPauseReasonDto {
  @ApiProperty({
    example: 'Scheduled contract maintenance',
    description: 'Human-readable pause reason, or an empty string if unset',
  })
  reason: string;
}