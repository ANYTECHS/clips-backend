import { Module } from '@nestjs/common';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';
import { QueueCleanupService } from './queue-cleanup.service';
import { CLIP_GENERATION_QUEUE } from '../clips/clip-generation.queue';
import { registerQueue } from '../common';

@Module({
  imports: [
    registerQueue(CLIP_GENERATION_QUEUE),
  ],
  controllers: [JobsController],
  providers: [JobsService, QueueCleanupService],
})
export class JobsModule {}
