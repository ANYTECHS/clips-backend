import { BullModule } from '@nestjs/bullmq';
import { DynamicModule } from '@nestjs/common';
import {
  CLIP_GENERATION_QUEUE,
  CLIP_GENERATION_QUEUE_PRIORITY,
} from '../../clips/clip-generation.queue';
import {
  NFT_MINT_QUEUE,
  NFT_MINT_QUEUE_PRIORITY,
} from '../../clips/nft-mint.queue';
import {
  CLIP_POSTING_QUEUE,
  CLIP_POSTING_QUEUE_PRIORITY,
} from '../../clips/clip-posting.queue';
import {
  ANOMALY_DETECTION_QUEUE,
  ANOMALY_DETECTION_QUEUE_PRIORITY,
} from '../../earnings/anomaly-detection.queue';
import {
  EMAIL_DELIVERY_QUEUE,
  EMAIL_DELIVERY_QUEUE_PRIORITY,
} from '../../auth/email-delivery.queue';

const QUEUE_PRIORITIES: Record<string, number> = {
  [CLIP_GENERATION_QUEUE]: CLIP_GENERATION_QUEUE_PRIORITY,
  [NFT_MINT_QUEUE]: NFT_MINT_QUEUE_PRIORITY,
  [CLIP_POSTING_QUEUE]: CLIP_POSTING_QUEUE_PRIORITY,
  [ANOMALY_DETECTION_QUEUE]: ANOMALY_DETECTION_QUEUE_PRIORITY,
  [EMAIL_DELIVERY_QUEUE]: EMAIL_DELIVERY_QUEUE_PRIORITY,
};

/**
 * Centrally configures and registers a BullMQ queue by name.
 * Reduces duplication and ensures consistent configuration across modules.
 */
export function registerQueue(name: string): DynamicModule {
  const priority = QUEUE_PRIORITIES[name] ?? 5; // Default priority if not specified
  return BullModule.registerQueue({
    name,
    defaultJobOptions: { priority },
  });
}
