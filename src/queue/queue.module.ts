import { Global, Module, OnModuleInit, Optional, Inject } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule, getQueueToken } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QueueConfigService } from './queue-config.service';
import { RetryBackoffConfigService } from './retry-backoff-config.service';
import { QueueHealthService } from './queue-health.service';
import { GracefulShutdownService } from '../common/shutdown/graceful-shutdown.service';
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
  providers: [QueueConfigService, RetryBackoffConfigService, QueueHealthService],
  exports: [BullModule, QueueConfigService, RetryBackoffConfigService, QueueHealthService],
})
export class QueueModule implements OnModuleInit {
  constructor(
    @Optional() private readonly shutdownService?: GracefulShutdownService,
    @Optional()
    @Inject(getQueueToken(CLIP_GENERATION_QUEUE))
    private readonly clipGenQueue?: Queue,
    @Optional()
    @Inject(getQueueToken(CLIP_POSTING_QUEUE))
    private readonly clipPostQueue?: Queue,
    @Optional()
    @Inject(getQueueToken(NFT_MINT_QUEUE))
    private readonly nftMintQueue?: Queue,
    @Optional()
    @Inject(getQueueToken(EMAIL_DELIVERY_QUEUE))
    private readonly emailQueue?: Queue,
    @Optional()
    @Inject(getQueueToken(ANOMALY_DETECTION_QUEUE))
    private readonly anomalyQueue?: Queue,
  ) {}

  onModuleInit(): void {
    if (!this.shutdownService) return;
    const queues = [
      this.clipGenQueue,
      this.clipPostQueue,
      this.nftMintQueue,
      this.emailQueue,
      this.anomalyQueue,
    ];
    for (const q of queues) {
      if (q) {
        this.shutdownService.registerQueue(q);
      }
    }
  }
}
