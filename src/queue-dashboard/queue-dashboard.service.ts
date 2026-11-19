import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { CLIP_GENERATION_QUEUE } from '../clips/clip-generation.queue';
import { CLIP_POSTING_QUEUE } from '../clips/clip-posting.queue';
import { PAYOUT_RETRY_QUEUE } from '../payouts/payout-retry.queue';
import { NFT_MINT_QUEUE } from '../clips/nft-mint.queue';
import { ANOMALY_DETECTION_QUEUE } from '../earnings/anomaly-detection.queue';
import { EMAIL_DELIVERY_QUEUE } from '../auth/email-delivery.queue';

@Injectable()
export class QueueDashboardService {
  private serverAdapter: ExpressAdapter;
  private queues: Record<string, Queue>;

  constructor(
    @InjectQueue(CLIP_GENERATION_QUEUE)
    private clipGenerationQueue: Queue,
    @InjectQueue(CLIP_POSTING_QUEUE)
    private clipPostingQueue: Queue,
    @InjectQueue(PAYOUT_RETRY_QUEUE)
    private payoutRetryQueue: Queue,
    @InjectQueue(NFT_MINT_QUEUE)
    private nftMintQueue: Queue,
    @InjectQueue(ANOMALY_DETECTION_QUEUE)
    private anomalyDetectionQueue: Queue,
    @InjectQueue(EMAIL_DELIVERY_QUEUE)
    private emailDeliveryQueue: Queue,
  ) {
    this.queues = {
      [CLIP_GENERATION_QUEUE]: this.clipGenerationQueue,
      [CLIP_POSTING_QUEUE]: this.clipPostingQueue,
      [PAYOUT_RETRY_QUEUE]: this.payoutRetryQueue,
      [NFT_MINT_QUEUE]: this.nftMintQueue,
      [ANOMALY_DETECTION_QUEUE]: this.anomalyDetectionQueue,
      [EMAIL_DELIVERY_QUEUE]: this.emailDeliveryQueue,
    };

    this.serverAdapter = new ExpressAdapter();
    this.serverAdapter.setBasePath('/admin/queues');

    createBullBoard({
      queues: Object.values(this.queues).map(queue => new BullMQAdapter(queue)),
      serverAdapter: this.serverAdapter,
    });
  }

  getRouter() {
    return this.serverAdapter.getRouter();
  }

  async pauseQueue(queueName: string): Promise<void> {
    const queue = this.queues[queueName];
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }
    await queue.pause();
  }

  async resumeQueue(queueName: string): Promise<void> {
    const queue = this.queues[queueName];
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }
    await queue.resume();
  }

  async pauseAllQueues(): Promise<void> {
    await Promise.all(Object.values(this.queues).map(queue => queue.pause()));
  }

  async resumeAllQueues(): Promise<void> {
    await Promise.all(Object.values(this.queues).map(queue => queue.resume()));
  }
}
