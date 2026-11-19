import {
  Injectable,
  Logger,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { NFT_MINT_QUEUE, NFT_MINT_JOB_OPTIONS } from './nft-mint.queue';
import type { NftMintJob } from './nft-mint.processor';
import { QueueOverflowService } from '../common/queue/queue-overflow.service';
import { getBullMQRateLimitConfig } from '../config/bullmq.config';

export type NftMintTxState =
  | 'pending'
  | 'confirmed'
  | 'failed'
  | 'unknown';

/**
 * NftMintEnqueueService (#974)
 *
 * Moves Soroban mint processing off the request path and into the dedicated
 * `nft-mint` BullMQ queue (separate worker, own concurrency + retry policy),
 * so video processing never blocks NFT minting and vice versa.
 *
 * Dedupe: the BullMQ jobId is deterministic (`nft-mint-{clipId}`), so a
 * second enqueue for a clip with an active job returns 409 instead of
 * double-minting.
 */
@Injectable()
export class NftMintEnqueueService {
  private readonly logger = new Logger(NftMintEnqueueService.name);

  constructor(
    @InjectQueue(NFT_MINT_QUEUE) private readonly mintQueue: Queue<NftMintJob>,
    private readonly queueOverflowService: QueueOverflowService,
    private readonly configService: ConfigService,
  ) {}

  static jobIdForClip(clipId: number): string {
    return `nft-mint-clip-${clipId}`;
  }

  async enqueueMint(input: {
    clipId: number;
    walletAddress: string;
    userId: number;
  }): Promise<{ jobId: string; delayed: boolean; delayMs: number }> {
    const jobId = NftMintEnqueueService.jobIdForClip(input.clipId);

    // Dedupe: an already-queued/active job for this clip is a 409.
    const existing = await this.mintQueue.getJob(jobId);
    if (existing) {
      const state = await existing.getState().catch(() => 'unknown');
      if (state === 'waiting' || state === 'active' || state === 'delayed' || state === 'prioritized') {
        throw new ConflictException(
          `Mint job for clip ${input.clipId} is already ${state} (job ${jobId})`,
        );
      }
    }

    const rateLimits = getBullMQRateLimitConfig(this.configService);
    const result = await this.queueOverflowService.enqueue({
      queue: this.mintQueue as Queue<any>,
      jobName: 'mint',
      data: {
        clipId: input.clipId,
        walletAddress: input.walletAddress,
        userId: input.userId,
      },
      baseOptions: {
        ...NFT_MINT_JOB_OPTIONS,
        jobId,
      } as Record<string, unknown>,
      rateLimitConfig: rateLimits.nftMint,
    });

    this.logger.log(
      `Enqueued NFT mint job ${result.jobId} for clip ${input.clipId}` +
        (result.delayed ? ` (delayed ${result.delayMs}ms by overflow guard)` : ''),
    );
    return {
      jobId: result.jobId ?? jobId,
      delayed: result.delayed,
      delayMs: result.delayMs,
    };
  }

  async getMintStatus(jobId: string): Promise<{
    jobId: string;
    state: string;
    txState: NftMintTxState;
    attemptsMade: number;
    failedReason?: string;
    result?: unknown;
  }> {
    const job = await this.mintQueue.getJob(jobId);
    if (!job) {
      throw new NotFoundException(`Mint job ${jobId} not found`);
    }
    const state = await job.getState();
    const txState: NftMintTxState =
      state === 'completed'
        ? 'confirmed'
        : state === 'failed'
          ? 'failed'
          : state === 'waiting' || state === 'active' || state === 'delayed' || state === 'prioritized'
            ? 'pending'
            : 'unknown';
    return {
      jobId,
      state,
      txState,
      attemptsMade: job.attemptsMade,
      failedReason: job.failedReason,
      result: job.returnvalue,
    };
  }
}
