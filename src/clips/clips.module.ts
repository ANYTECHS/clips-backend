import { Module } from '@nestjs/common';
import { ClipsController } from './clips.controller';
import { ClipsService } from './clips.service';
import { CloudinaryService } from './cloudinary.service';
import { PrismaModule } from '../prisma/prisma.module';
import { registerQueue } from '../common';
import { CLIP_GENERATION_QUEUE } from './clip-generation.queue';

@Module({
  imports: [PrismaModule, registerQueue(CLIP_GENERATION_QUEUE)],
  controllers: [ClipsController],
  providers: [ClipsService, CloudinaryService],
  exports: [ClipsService, CloudinaryService],
})
export class ClipsModule {}
