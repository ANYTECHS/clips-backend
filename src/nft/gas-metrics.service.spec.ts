import { Test } from '@nestjs/testing';
import { GasMetricsService } from './gas-metrics.service';

describe('GasMetricsService (#1026)', () => {
  let service: GasMetricsService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [GasMetricsService],
    }).compile();

    service = moduleRef.get(GasMetricsService);
  });

  describe('seeding', () => {
    it('seeds a mint and a transfer benchmark in the constructor', () => {
      const stats = service.getStats();

      expect(stats.mintOperationsCount).toBe(1);
      expect(stats.transferOperationsCount).toBe(1);
      expect(stats.benchmarks).toHaveLength(2);
    });

    it('seeds the documented mint baseline', () => {
      const mint = service
        .getStats()
        .benchmarks.find((b) => b.operation === 'mint');

      expect(mint).toMatchObject({
        cpuInstructions: 1250000,
        memoryBytes: 45000,
        gasUnits: 15200,
      });
    });

    it('seeds the documented transfer baseline', () => {
      const transfer = service
        .getStats()
        .benchmarks.find((b) => b.operation === 'transfer');

      expect(transfer).toMatchObject({
        cpuInstructions: 890000,
        memoryBytes: 32000,
        gasUnits: 11400,
      });
    });

    it('stamps every benchmark with an ISO timestamp', () => {
      for (const benchmark of service.getStats().benchmarks) {
        expect(benchmark.timestamp).toMatch(
          /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
        );
        expect(Number.isNaN(Date.parse(benchmark.timestamp))).toBe(false);
      }
    });
  });

  describe('recordBenchmark', () => {
    it('returns the recorded entry', () => {
      const entry = service.recordBenchmark('mint', 1, 2, 3);

      expect(entry).toMatchObject({
        operation: 'mint',
        cpuInstructions: 1,
        memoryBytes: 2,
        gasUnits: 3,
      });
    });

    it('applies the documented defaults when metrics are omitted', () => {
      const entry = service.recordBenchmark('transfer');

      expect(entry).toMatchObject({
        cpuInstructions: 1000000,
        memoryBytes: 40000,
        gasUnits: 12000,
      });
    });

    it('records the entry in the returned object and in the stats', () => {
      const entry = service.recordBenchmark('mint', 5, 6, 7);

      expect(service.getStats().benchmarks[0]).toEqual(entry);
    });

    it('puts the newest benchmark first', () => {
      service.recordBenchmark('mint', 1, 1, 1);
      service.recordBenchmark('transfer', 2, 2, 2);

      const stats = service.getStats();
      expect(stats.benchmarks[0].operation).toBe('transfer');
      expect(stats.benchmarks[1].operation).toBe('mint');
    });

    it('caps the retained benchmark history at 100 entries', () => {
      for (let i = 0; i < 150; i += 1) {
        service.recordBenchmark('mint', i, i, i);
      }

      expect(service.getStats().benchmarks).toHaveLength(20);
    });

    it('derives the aggregate counts from the capped 100-entry history', () => {
      for (let i = 0; i < 150; i += 1) {
        service.recordBenchmark('transfer', i, i, i);
      }

      const stats = service.getStats();
      // 1 seeded + 149 new transfers, but the history is capped at 100.
      expect(stats.transferOperationsCount).toBe(100);
      expect(stats.benchmarks).toHaveLength(20);
    });
  });

  describe('getStats', () => {
    it('averages the mint gas across every recorded mint', () => {
      service.recordBenchmark('mint', 1, 1, 100);
      service.recordBenchmark('mint', 1, 1, 200);

      // Seeded 15200 + 100 + 200 => 15500 / 3 = 5166.67 => 5167
      expect(service.getStats().averageMintGas).toBe(5167);
    });

    it('averages the transfer gas across every recorded transfer', () => {
      service.recordBenchmark('transfer', 1, 1, 100);

      // Seeded 11400 + 100 => 5750
      expect(service.getStats().averageTransferGas).toBe(5750);
    });

    it('rounds the averages to whole gas units', () => {
      service.recordBenchmark('mint', 1, 1, 1);

      const { averageMintGas } = service.getStats();
      expect(Number.isInteger(averageMintGas)).toBe(true);
    });

    it('leaves the other operation untouched when only one is recorded', () => {
      service.recordBenchmark('mint', 1, 1, 999);

      const stats = service.getStats();
      expect(stats.averageTransferGas).toBe(11400);
      expect(stats.transferOperationsCount).toBe(1);
    });

    it('counts operations per type', () => {
      service.recordBenchmark('mint', 1, 1, 1);
      service.recordBenchmark('mint', 1, 1, 1);
      service.recordBenchmark('transfer', 1, 1, 1);

      const stats = service.getStats();
      expect(stats.mintOperationsCount).toBe(3);
      expect(stats.transferOperationsCount).toBe(2);
    });

    it('returns at most the 20 most recent benchmarks', () => {
      for (let i = 0; i < 40; i += 1) {
        service.recordBenchmark('mint', i, i, i);
      }

      expect(service.getStats().benchmarks).toHaveLength(20);
    });

    it('returns a snapshot that cannot mutate the internal history', () => {
      const stats = service.getStats();
      const countBefore = service.getStats().benchmarks.length;

      stats.benchmarks.pop();
      stats.benchmarks.length = 0;

      expect(service.getStats().benchmarks).toHaveLength(countBefore);
    });
  });
});
