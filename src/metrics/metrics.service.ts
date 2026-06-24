import { Injectable } from '@nestjs/common';
import { Counter, Gauge, Registry } from 'prom-client';

@Injectable()
export class MetricsService {
  private readonly registry = new Registry();

  private readonly nftMintCounter: Counter<string>;
  private readonly clipsGeneratedCounter: Counter<string>;
  private readonly jobFailuresCounter: Counter<string>;
  private readonly queueDepthGauge: Gauge<string>;

  constructor() {
    this.nftMintCounter = new Counter({
      name: 'nft_mints_total',
      help: 'Total NFT mint operations',
      labelNames: ['status'],
      registers: [this.registry],
    });

    this.clipsGeneratedCounter = new Counter({
      name: 'clips_generated_total',
      help: 'Total clip generation operations',
      labelNames: ['status'],
      registers: [this.registry],
    });

    this.jobFailuresCounter = new Counter({
      name: 'queue_job_failures_total',
      help: 'Total queue job failures',
      labelNames: ['queue'],
      registers: [this.registry],
    });

    this.queueDepthGauge = new Gauge({
      name: 'queue_depth',
      help: 'Current queue depth',
      labelNames: ['queue'],
      registers: [this.registry],
    });
  }

  getRegistry(): Registry {
    return this.registry;
  }

  incrementNftMints(status: 'success' | 'failure'): void {
    this.nftMintCounter.inc({ status });
  }

  incrementClipsGenerated(status: 'success' | 'failure'): void {
    this.clipsGeneratedCounter.inc({ status });
  }

  recordJobStart(_jobMetricId: string): void {
    // Reserved for future per-job timing metrics.
  }

  recordJobCompletion(
    _jobMetricId: string,
    _queue: string,
    _status: 'success' | 'failure',
  ): void {
    // Reserved for future per-job timing metrics.
  }

  recordJobFailure(queue: string, _error: string): void {
    this.jobFailuresCounter.inc({ queue });
  }

  setQueueDepth(queue: string, depth: number): void {
    this.queueDepthGauge.set({ queue }, depth);
  }
}
