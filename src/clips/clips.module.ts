import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ClipsService } from './clips.service';
import { CloudinaryService } from './cloudinary.service';
import { NftMintService } from './nft-mint.service';

/**
 * ClipsModule owns clip lifecycle management, queue constants, and
 * shared processing utilities (Cloudinary, FFmpeg stubs).
 */
@Module({
  imports: [PrismaModule],
  providers: [ClipsService, CloudinaryService, NftMintService],
  exports: [ClipsService, CloudinaryService, NftMintService],
})
export class ClipsModule {}
