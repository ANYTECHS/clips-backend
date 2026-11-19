import { Module } from '@nestjs/common';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';
import { DeadLetterController } from './dead-letter.controller';
import { DeadLetterService } from './dead-letter.service';
import { QueueCleanupService } from './queue-cleanup.service';
import { QueueMetricsService } from '../metrics/queue-metrics.service';
import { CLIP_GENERATION_QUEUE } from '../clips/clip-generation.queue';
import { CLIP_POSTING_QUEUE } from '../clips/clip-posting.queue';
import { NFT_MINT_QUEUE } from '../clips/nft-mint.queue';
import { registerQueue } from '../common';

@Module({
  imports: [
    registerQueue(CLIP_GENERATION_QUEUE),
    registerQueue(CLIP_POSTING_QUEUE),
    registerQueue(NFT_MINT_QUEUE),
  ],
  controllers: [JobsController, DeadLetterController],
  providers: [JobsService, QueueCleanupService, QueueMetricsService, DeadLetterService],
})
export class JobsModule {}
