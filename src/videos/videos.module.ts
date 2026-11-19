import { Module } from '@nestjs/common';
import { VideosController } from './videos.controller';
import { VideoUploadController } from './video-upload.controller';
import { ClipsModule } from '../clips/clips.module';
import { PrismaModule } from '../prisma/prisma.module';
import { VideoUploadService } from './video-upload.service';
import { VideoProcessingService } from './video-processing.service';
import { VideoProgressGatewayModule } from './video-progress-gateway.module';
import { ClipGenerationProcessor } from './clip-generation.processor';
import { CLIP_GENERATION_QUEUE } from '../clips/clip-generation.queue';
import { registerQueue } from '../common';

@Module({
  imports: [
    ClipsModule,
    PrismaModule,
    VideoProgressGatewayModule,
    registerQueue(CLIP_GENERATION_QUEUE),
  ],
  controllers: [VideosController, VideoUploadController],
  providers: [
    VideoUploadService,
    VideoProcessingService,
    ClipGenerationProcessor,
  ],
  exports: [VideoUploadService, VideoProcessingService],
})
export class VideosModule {}
