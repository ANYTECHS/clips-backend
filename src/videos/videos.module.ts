import { Module } from '@nestjs/common';
import { VideosController } from './videos.controller';
import { VideoUploadController } from './video-upload.controller';
import { ClipsModule } from '../clips/clips.module';
import { PrismaModule } from '../prisma/prisma.module';
import { VideoUploadService } from './video-upload.service';
import { VideoProcessingService } from './video-processing.service';
import { CLIP_GENERATION_QUEUE } from '../clips/clip-generation.queue';
import { registerQueue } from '../common';

@Module({
  imports: [
    ClipsModule,
    PrismaModule,
    registerQueue(CLIP_GENERATION_QUEUE),
  ],
  controllers: [VideosController, VideoUploadController],
  providers: [VideoUploadService, VideoProcessingService],
  exports: [VideoUploadService, VideoProcessingService],
})
export class VideosModule {}
