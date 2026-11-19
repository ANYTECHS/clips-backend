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
import { NFT_MINT_QUEUE } from './nft-mint.queue';
import { NftMintProcessor } from './nft-mint.processor';
import { NftMintEnqueueService } from './nft-mint-enqueue.service';
import { QueueOverflowService } from '../common/queue/queue-overflow.service';

@Module({
  imports: [
    PrismaModule,
    StellarModule,
    CircuitBreakerModule,
    IpfsUploadModule,
    registerQueue(CLIP_GENERATION_QUEUE),
    registerQueue(NFT_MINT_QUEUE),
  ],
  controllers: [ClipsController],
  providers: [
    ClipsService,
    CloudinaryService,
    ClipPublishService,
    NftConfig,
    NftMetadataService,
    NftMintService,
    NftMintEnqueueService,
    NftMintProcessor,
    RoyaltyConfigurationService,
    QueueOverflowService,
  ],
  exports: [ClipsService, CloudinaryService, NftMintService, NftMintEnqueueService],
})
export class ClipsModule {}
