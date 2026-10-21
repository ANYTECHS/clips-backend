import { Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { NFT_MINT_QUEUE } from './nft-mint.queue';
import { NftMintService } from './nft-mint.service';
import { MetricsService } from '../metrics/metrics.service';
import { GracefulShutdownService } from '../common/shutdown/graceful-shutdown.service';
import { getBullMQWorkerConfig } from '../config/bullmq.config';
import { handleFailedEvent, handleProcessingError } from '../queue/processor-error.handler';

export interface NftMintJob {
  clipId: number;
  walletAddress: string;
  userId: number;
}

@Processor(NFT_MINT_QUEUE, {
  concurrency: getBullMQWorkerConfig(new ConfigService()).nftMintConcurrency,
})
export class NftMintProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(NftMintProcessor.name);

  constructor(
    private readonly nftMintService: NftMintService,
    private readonly metricsService: MetricsService,
    private readonly shutdownService: GracefulShutdownService,
  ) {
    super();
  }

  onModuleInit(): void {
    this.shutdownService.register(this.worker);
  }

  async process(job: Job<NftMintJob>): Promise<{ xdr: string; clipId: number }> {
    const { clipId, walletAddress } = job.data;
    this.logger.log(`Processing NFT mint job ${job.id} for clip ${clipId}`);

    const jobMetricId = `${NFT_MINT_QUEUE}:${job.id}`;
    this.metricsService.recordJobStart(jobMetricId);

    try {
      const result = await this.nftMintService.prepareMintTx(clipId, walletAddress);
      this.metricsService.recordJobCompletion(jobMetricId, NFT_MINT_QUEUE, 'success');
      return { xdr: result.xdr, clipId };
    } catch (error) {
      handleProcessingError(
        this.logger,
        this.metricsService,
        NFT_MINT_QUEUE,
        job,
        jobMetricId,
        error,
      );
    }
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<NftMintJob>, error: Error): void {
    // Standardized retry vs final logging + final_failure metric (Issue #1235).
    handleFailedEvent(this.logger, this.metricsService, NFT_MINT_QUEUE, job, error, 2000);
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job<NftMintJob>): void {
    this.logger.log(`NFT mint job ${job.id} completed for clip ${job.data.clipId}`);
  }
}
