import { ApiProperty } from '@nestjs/swagger';

export class GasBenchmarkDto {
  @ApiProperty({ example: 'mint', description: 'Operation type (mint | transfer)' })
  operation!: 'mint' | 'transfer';

  @ApiProperty({ example: 1250000, description: 'Gas used in CPU instructions' })
  cpuInstructions!: number;

  @ApiProperty({ example: 45000, description: 'Gas used in memory bytes' })
  memoryBytes!: number;

  @ApiProperty({ example: 15450, description: 'Total gas units consumed' })
  gasUnits!: number;

  @ApiProperty({ example: '2026-07-29T16:14:57.000Z', description: 'Benchmark timestamp' })
  timestamp!: string;
}

export class GasStatsResponseDto {
  @ApiProperty({ example: 15200, description: 'Average gas units for mint operations' })
  averageMintGas!: number;

  @ApiProperty({ example: 11400, description: 'Average gas units for transfer operations' })
  averageTransferGas!: number;

  @ApiProperty({ example: 12, description: 'Total mint benchmark samples recorded' })
  mintOperationsCount!: number;

  @ApiProperty({ example: 8, description: 'Total transfer benchmark samples recorded' })
  transferOperationsCount!: number;

  @ApiProperty({
    type: [GasBenchmarkDto],
    description: 'Recent benchmark recordings for key contract operations',
    example: [
      {
        operation: 'mint',
        cpuInstructions: 1250000,
        memoryBytes: 45000,
        gasUnits: 15200,
        timestamp: '2026-07-29T16:14:57.000Z',
      },
      {
        operation: 'transfer',
        cpuInstructions: 890000,
        memoryBytes: 32000,
        gasUnits: 11400,
        timestamp: '2026-07-29T16:10:00.000Z',
      },
    ],
  })
  benchmarks!: GasBenchmarkDto[];
}
