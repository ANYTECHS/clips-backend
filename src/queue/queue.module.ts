import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { QueueConfigService } from './queue-config.service';
import {
  CLIP_GENERATION_QUEUE,
  CLIP_GENERATION_QUEUE_PRIORITY,
} from '../clips/clip-generation.queue';
import {
  CLIP_POSTING_QUEUE,
  CLIP_POSTING_QUEUE_PRIORITY,
} from '../clips/clip-posting.queue';
import {
  NFT_MINT_QUEUE,
  NFT_MINT_QUEUE_PRIORITY,
} from '../clips/nft-mint.queue';
import {
  EMAIL_DELIVERY_QUEUE,
  EMAIL_DELIVERY_QUEUE_PRIORITY,
} from '../auth/email-delivery.queue';
import {
  ANOMALY_DETECTION_QUEUE,
  ANOMALY_DETECTION_QUEUE_PRIORITY,
} from '../earnings/anomaly-detection.queue';

export const REGISTERED_QUEUE_NAMES = [
  CLIP_GENERATION_QUEUE,
  CLIP_POSTING_QUEUE,
  NFT_MINT_QUEUE,
  EMAIL_DELIVERY_QUEUE,
  ANOMALY_DETECTION_QUEUE,
] as const;

@Global()
@Module({
  imports: [
    ConfigModule,
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new QueueConfigService(config).bullOptions,
    }),
    BullModule.registerQueue(
      {
        name: CLIP_GENERATION_QUEUE,
        defaultJobOptions: { priority: CLIP_GENERATION_QUEUE_PRIORITY },
      },
      {
        name: CLIP_POSTING_QUEUE,
        defaultJobOptions: { priority: CLIP_POSTING_QUEUE_PRIORITY },
      },
      {
        name: NFT_MINT_QUEUE,
        defaultJobOptions: { priority: NFT_MINT_QUEUE_PRIORITY },
      },
      {
        name: EMAIL_DELIVERY_QUEUE,
        defaultJobOptions: { priority: EMAIL_DELIVERY_QUEUE_PRIORITY },
      },
      {
        name: ANOMALY_DETECTION_QUEUE,
        defaultJobOptions: { priority: ANOMALY_DETECTION_QUEUE_PRIORITY },
      },
    ),
  ],
  providers: [QueueConfigService],
  exports: [BullModule, QueueConfigService],
})
export class QueueModule {}
