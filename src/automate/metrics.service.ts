import { Injectable } from '@nestjs/common';
import {
  Counter,
  Gauge,
  Histogram,
  Registry,
  collectDefaultMetrics,
} from 'prom-client';

@Injectable()
export class MetricsService {
  private readonly registry = new Registry();

  private readonly clipsGenerated = new Counter({
    name: 'clipcash_clips_generated_total',
    help: 'Total number of generated clips by status',
    labelNames: ['status'],
    registers: [this.registry],
  });

  private readonly nftMints = new Counter({
    name: 'clipcash_nft_mints_total',
    help: 'Total number of NFT mint attempts by status',
    labelNames: ['status'],
    registers: [this.registry],
  });

  private readonly queueDepth = new Gauge({
    name: 'clipcash_job_queue_depth',
    help: 'Current queue depth by queue name',
    labelNames: ['queue'],
    registers: [this.registry],
  });

  private readonly httpDuration = new Histogram({
    name: 'clipcash_http_request_duration_seconds',
    help: 'HTTP request duration in seconds',
    labelNames: ['method', 'route', 'status_code'],
    buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5],
    registers: [this.registry],
  });

  private readonly stellarRpcErrors = new Counter({
    name: 'clipcash_stellar_rpc_errors_total',
    help: 'Total number of Stellar RPC errors',
    registers: [this.registry],
  });

  private readonly cloudinaryUploadErrors = new Counter({
    name: 'clipcash_cloudinary_upload_errors_total',
    help: 'Total number of Cloudinary upload errors',
    registers: [this.registry],
  });

  constructor() {
    collectDefaultMetrics({ register: this.registry });
  }

  incrementClipsGenerated(status: 'success' | 'failure'): void {
    this.clipsGenerated.inc({ status });
  }

  incrementNftMints(status: 'success' | 'failure'): void {
    this.nftMints.inc({ status });
  }

  setQueueDepth(queue: string, depth: number): void {
    this.queueDepth.set({ queue }, depth);
  }

  observeHttpDuration(params: {
    method: string;
    route: string;
    statusCode: number;
    seconds: number;
  }): void {
    this.httpDuration.observe(
      {
        method: params.method,
        route: params.route,
        status_code: String(params.statusCode),
      },
      params.seconds,
    );
  }

  incrementStellarRpcErrors(): void {
    this.stellarRpcErrors.inc();
  }

  incrementCloudinaryUploadErrors(): void {
    this.cloudinaryUploadErrors.inc();
  }

  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }

  getContentType(): string {
    return this.registry.contentType;
  }
}
