import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { CLIP_GENERATION_QUEUE } from '../clips/clip-generation.queue';
import { CLIP_POSTING_QUEUE } from '../clips/clip-posting.queue';
import { NFT_MINT_QUEUE } from '../clips/nft-mint.queue';

const SUPPORTED_QUEUES = [
  CLIP_GENERATION_QUEUE,
  CLIP_POSTING_QUEUE,
  NFT_MINT_QUEUE,
] as const;

@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);

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

  private resolveQueue(type: string): Queue {
    const queue = this.queueMap[type];
    if (!queue) {
      throw new BadRequestException(
        `Unsupported queue type: "${type}". Supported: ${SUPPORTED_QUEUES.join(', ')}`,
      );
    }
    return queue;
  }

  /**
   * Returns failed jobs from the specified queue.
   */
  async getFailedJobs(type: string) {
    const queue = this.resolveQueue(type);
    const failedJobs = await queue.getFailed();

    return failedJobs.map((job) => ({
      id: job.id,
      name: job.name,
      data: job.data,
      failedReason: job.failedReason,
      stacktrace: job.stacktrace,
      attemptsMade: job.attemptsMade,
      finishedOn: job.finishedOn,
      processedOn: job.processedOn,
    }));
  }

  /**
   * Retries a specific job by ID from the specified queue.
   */
  async retryJob(jobId: string, type?: string) {
    const queues = type ? [this.resolveQueue(type)] : Object.values(this.queueMap);

    for (const queue of queues) {
      const job = await queue.getJob(jobId);
      if (!job) continue;

      const state = await job.getState();
      if (state !== 'failed') {
        throw new BadRequestException(
          `Job ${jobId} is not in failed state (current state: ${state})`,
        );
      }

      await job.retry();
      this.logger.log(`Job ${jobId} retried from ${queue.name}`);
      return { message: `Job ${jobId} retried successfully`, queue: queue.name };
    }

    throw new NotFoundException(`Job ${jobId} not found in any queue`);
  }
}
