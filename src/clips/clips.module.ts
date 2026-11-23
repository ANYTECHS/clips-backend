import { Module } from '@nestjs/common';
import { ClipsController } from './clips.controller';
import { ClipsService } from './clips.service';
import { CloudinaryService } from './cloudinary.service';
import { ClipPublishService } from './clip-publish.service';
import { AyrshareService } from './ayrshare.service';
import { ClipPostingProcessor } from './clip-posting.processor';
import { NftMintService } from './nft-mint.service';
import { PrismaModule } from '../prisma/prisma.module';
import { StellarModule } from '../stellar/stellar.module';
import { RedisModule } from '../redis/redis.module';
import { CircuitBreakerModule } from '../common/circuit-breaker/circuit-breaker.module';
import { IpfsUploadModule } from '../nft/ipfs-upload.module';
import { UserPlatformModule } from '../user-platform/user-platform.module';
import { NftConfig } from '../nft/nft.config';
import { NftMetadataService } from '../nft/nft-metadata.service';
import { RoyaltyConfigurationService } from '../nft/royalty-configuration.service';
import { registerQueue } from '../common';
import { CLIP_GENERATION_QUEUE } from './clip-generation.queue';
import { CLIP_POSTING_QUEUE } from './clip-posting.queue';
import { NFT_MINT_QUEUE } from './nft-mint.queue';
import { NftMintProcessor } from './nft-mint.processor';
import { NftMintEnqueueService } from './nft-mint-enqueue.service';
import { QueueOverflowService } from '../common/queue/queue-overflow.service';
import { UserPlatformModule } from '../user-platform/user-platform.module';
import { AyrshareService } from './ayrshare.service';
import { ClipPostingProcessor } from './clip-posting.processor';
import { CLIP_POSTING_QUEUE } from './clip-posting.queue';

@Module({
  imports: [
    PrismaModule,
    StellarModule,
    RedisModule,
    CircuitBreakerModule,
    IpfsUploadModule,
    UserPlatformModule,
    registerQueue(CLIP_GENERATION_QUEUE),
    registerQueue(CLIP_POSTING_QUEUE),
    registerQueue(NFT_MINT_QUEUE),
  ],
  controllers: [ClipsController],
  providers: [
    ClipsService,
    CloudinaryService,
    ClipPublishService,
    AyrshareService,
    ClipPostingProcessor,
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
