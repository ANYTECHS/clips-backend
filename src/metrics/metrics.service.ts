import { Injectable } from '@nestjs/common';

@Injectable()
export class MetricsService {
  private readonly counters: Map<string, number> = new Map();

  increment(key: string, value = 1): void {
    this.counters.set(key, (this.counters.get(key) ?? 0) + value);
  }

  incrementClipsGenerated(status: 'success' | 'failure'): void {
    this.increment(`clipcash_clips_generated_total{status="${status}"}`);
  }

  incrementNftMints(status: 'success' | 'failure'): void {
    this.increment(`clipcash_nft_mints_total{status="${status}"}`);
  }

  setQueueDepth(queue: string, depth: number): void {
    this.counters.set(`clipcash_job_queue_depth{queue="${queue}"}`, depth);
  }

  getMetrics(): Record<string, number> {
    return Object.fromEntries(this.counters);
  }
}
