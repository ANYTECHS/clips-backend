import { Module } from '@nestjs/common';
import { ClipsController } from './clips.controller';
import { ClipsService } from './clips.service';
import { CloudinaryService } from './cloudinary.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ClipsController],
  providers: [ClipsService, CloudinaryService],
  exports: [ClipsService, CloudinaryService],
})
export class ClipsModule {}
