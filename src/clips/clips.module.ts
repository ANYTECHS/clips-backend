import { Module } from '@nestjs/common';
import { ClipsService } from './clips.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [ClipsService],
  exports: [ClipsService],
})
export class ClipsModule {}
