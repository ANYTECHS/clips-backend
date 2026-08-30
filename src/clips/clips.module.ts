import { Module } from '@nestjs/common';
import { ClipsController } from './clips.controller';
import { ClipsService } from './clips.service';
import { CloudinaryService } from './cloudinary.service';
import { ClipPublishService } from './clip-publish.service';
import { NftMintService } from './nft-mint.service';
import { PrismaModule } from '../prisma/prisma.module';
import { StellarModule } from '../stellar/stellar.module';
import { CircuitBreakerModule } from '../common/circuit-breaker/circuit-breaker.module';
import { IpfsUploadModule } from '../nft/ipfs-upload.module';
import { NftConfig } from '../nft/nft.config';
import { NftMetadataService } from '../nft/nft-metadata.service';
import { RoyaltyConfigurationService } from '../nft/royalty-configuration.service';
import { registerQueue } from '../common';
import { CLIP_GENERATION_QUEUE } from './clip-generation.queue';

@Module({
  imports: [
    PrismaModule,
    StellarModule,
    CircuitBreakerModule,
    IpfsUploadModule,
    registerQueue(CLIP_GENERATION_QUEUE),
  ],
  controllers: [ClipsController],
  providers: [
    ClipsService,
    CloudinaryService,
    ClipPublishService,
    NftConfig,
    NftMetadataService,
    NftMintService,
    RoyaltyConfigurationService,
  ],
  exports: [ClipsService, CloudinaryService, NftMintService],
})
export class ClipsModule {}
