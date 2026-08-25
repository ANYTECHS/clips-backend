import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from '../prisma/prisma.module';
import { ClipsService } from './clips.service';
import { CloudinaryService } from './cloudinary.service';
import { CLIP_GENERATION_QUEUE } from './clip-generation.queue';
import { CLIP_POSTING_QUEUE } from './clip-posting.queue';
import { NFT_MINT_QUEUE } from './nft-mint.queue';

@Module({
  imports: [
    PrismaModule,
    BullModule.registerQueue(
      { name: CLIP_GENERATION_QUEUE },
      { name: CLIP_POSTING_QUEUE },
      { name: NFT_MINT_QUEUE },
    ),
  ],
  providers: [ClipsService, CloudinaryService],
  exports: [ClipsService, CloudinaryService, BullModule],
})
export class ClipsModule {}
