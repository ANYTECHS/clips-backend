import { Injectable, Logger } from '@nestjs/common';
import { GasBenchmarkDto, GasStatsResponseDto } from './dto/gas-stats.dto';

@Injectable()
export class GasMetricsService {
  private readonly logger = new Logger(GasMetricsService.name);
  private readonly benchmarks: GasBenchmarkDto[] = [];

  constructor() {
    // Seed initial benchmarks for gas monitoring metrics
    this.recordBenchmark('mint', 1250000, 45000, 15200);
    this.recordBenchmark('transfer', 890000, 32000, 11400);
  }

  /**
   * Log and store gas benchmark for key contract functions (Issue #684).
   */
  recordBenchmark(
    operation: 'mint' | 'transfer',
    cpuInstructions = 1000000,
    memoryBytes = 40000,
    gasUnits = 12000,
  ): GasBenchmarkDto {
    const entry: GasBenchmarkDto = {
      operation,
      cpuInstructions,
      memoryBytes,
      gasUnits,
      timestamp: new Date().toISOString(),
    };

    this.benchmarks.unshift(entry);
    if (this.benchmarks.length > 100) {
      this.benchmarks.pop();
    }

    this.logger.log(
      `Gas usage recorded for ${operation}: ${gasUnits} gas units (CPU: ${cpuInstructions}, Memory: ${memoryBytes} bytes)`,
    );

    return entry;
  }

  /**
   * Expose average gas metrics and benchmarks (Issue #684).
   */
  getStats(): GasStatsResponseDto {
    const mints = this.benchmarks.filter((b) => b.operation === 'mint');
    const transfers = this.benchmarks.filter((b) => b.operation === 'transfer');

    const averageMintGas =
      mints.length > 0
        ? Math.round(mints.reduce((acc, cur) => acc + cur.gasUnits, 0) / mints.length)
        : 0;

    const averageTransferGas =
      transfers.length > 0
        ? Math.round(
            transfers.reduce((acc, cur) => acc + cur.gasUnits, 0) / transfers.length,
          )
        : 0;

    return {
      averageMintGas,
      averageTransferGas,
      mintOperationsCount: mints.length,
      transferOperationsCount: transfers.length,
      benchmarks: this.benchmarks.slice(0, 20),
    };
  }
}
