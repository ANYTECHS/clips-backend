import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { CLIP_GENERATION_QUEUE } from '../clips/clip-generation.queue';
import { CLIP_POSTING_QUEUE } from '../clips/clip-posting.queue';
import { NFT_MINT_QUEUE } from '../clips/nft-mint.queue';

export interface DeadLetterJob {
  queue: string;
  id: string | undefined;
  name: string;
  data: unknown;
  failedReason: string;
  stacktrace: string[];
  attemptsMade: number;
  finishedOn?: number;
  processedOn?: number;
}

/**
 * DeadLetterService (#901)
 *
 * Permanently failed jobs are retained (removeOnFail: false on every
 * application queue) and surfaced here for admin inspection and
 * retry/replay. Aggregates `getFailed()` across all registered queues so
 * administrators have a single dead-letter view instead of per-queue
 * probing.
 */
@Injectable()
export class DeadLetterService {
  private readonly logger = new Logger(DeadLetterService.name);
  private readonly queueMap: Record<string, Queue>;

  constructor(
    @InjectQueue(CLIP_GENERATION_QUEUE) private readonly clipQueue: Queue,
    @InjectQueue(CLIP_POSTING_QUEUE) private readonly postingQueue: Queue,
    @InjectQueue(NFT_MINT_QUEUE) private readonly mintQueue: Queue,
  ) {
    this.queueMap = {
      [CLIP_GENERATION_QUEUE]: clipQueue,
      [CLIP_POSTING_QUEUE]: postingQueue,
      [NFT_MINT_QUEUE]: mintQueue,
    };
  }

  async listFailed(queue?: string, limit = 50): Promise<DeadLetterJob[]> {
    const queues = queue
      ? [this.queueMap[queue]].filter(Boolean)
      : Object.values(this.queueMap);
    const out: DeadLetterJob[] = [];
    for (const q of queues) {
      const failed = await q.getFailed(0, Math.max(limit - out.length, 0));
      for (const job of failed) {
        out.push({
          queue: q.name,
          id: job.id,
          name: job.name,
          data: job.data,
          failedReason: job.failedReason,
          stacktrace: job.stacktrace,
          attemptsMade: job.attemptsMade,
          finishedOn: job.finishedOn,
          processedOn: job.processedOn,
        });
        if (out.length >= limit) return out;
      }
    }
    return out;
  }

  async retry(jobId: string, queue?: string) {
    const queues = queue
      ? [this.queueMap[queue]].filter(Boolean)
      : Object.values(this.queueMap);
    for (const q of queues) {
      const job = await q.getJob(jobId);
      if (!job) continue;
      const state = await job.getState();
      if (state !== 'failed') continue;
      await job.retry();
      this.logger.log(`Dead-letter job ${jobId} replayed from ${q.name}`);
      return { message: `Job ${jobId} replayed successfully`, queue: q.name };
    }
    throw new NotFoundException(`Failed job ${jobId} not found in dead letter`);
  }
}
