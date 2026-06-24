import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { registerQueue } from '../common';
import { ClipsController } from './clips.controller';
import { ClipsService } from './clips.service';
import { ClipGenerationProcessor } from './clip-generation.processor';
import { CloudinaryService } from './cloudinary.service';
import {
  CLIP_GENERATION_QUEUE,
} from './clip-generation.queue';
import { NFT_MINT_QUEUE } from './nft-mint.queue';
import { NftMintProcessor } from './nft-mint.processor';
import {
  CLIP_POSTING_QUEUE,
} from './clip-posting.queue';
import { ClipPostingProcessor } from './clip-posting.processor';
import { ClipsGateway } from './clips.gateway';
import { PrismaModule } from '../prisma/prisma.module';
import { NftMintService } from './nft-mint.service';
import { StellarModule } from '../stellar/stellar.module';
import { CircuitBreakerModule } from '../common/circuit-breaker/circuit-breaker.module';
import { AyrshareService } from './ayrshare.service';
import { ClipPublishService } from './clip-publish.service';
import { RedisModule } from '../redis/redis.module';
import { QueueRateLimitGuard } from '../common/guards/queue-rate-limit.guard';
import { QueueOverflowService } from '../common/queue/queue-overflow.service';
import { UserPlatformModule } from '../user-platform/user-platform.module';
import { IpfsUploadModule } from '../nft/ipfs-upload.module';
import { NftOwnershipModule } from '../nft/nft-ownership.module';
import { RoyaltyConfigurationService } from '../nft/royalty-configuration.service';
import { MetricsModule } from '../metrics/metrics.module';
import { ConfigModule } from '../config/config.module';

@Module({
  imports: [
    ConfigModule,
    /**
     * Video-processing queue — CPU/memory intensive (FFmpeg, Cloudinary upload).
     * Concurrency is kept low (default 1) so the worker doesn't saturate the host.
     * Configured via the @Processor decorator on ClipGenerationProcessor.
     */
    registerQueue(CLIP_GENERATION_QUEUE),
    registerQueue(NFT_MINT_QUEUE),
    PrismaModule,
    StellarModule,
    CircuitBreakerModule,
    RedisModule,
    IpfsUploadModule,
    NftOwnershipModule,
    MetricsModule,
    ConfigModule,
    UserPlatformModule,

    /**
     * Posting queue — I/O-bound (Ayrshare HTTP calls, DB updates).
     * Higher concurrency is safe because jobs spend most of their time waiting
     * on network responses, not consuming CPU/memory.
     * Concurrency is configured via the @Processor decorator on ClipPostingProcessor.
     */
    registerQueue(CLIP_POSTING_QUEUE),

    // JwtModule used by ClipsGateway to verify WebSocket handshake tokens
    JwtModule.register({
      secret: process.env.JWT_SECRET ?? 'dev_jwt_secret',
      signOptions: { expiresIn: '7d' },
    }),
    UserPlatformModule,
  ],
  controllers: [ClipsController],
  providers: [
    ClipsService,
    // Heavy video-processing worker (concurrency: 1 — default)
    ClipGenerationProcessor,
    NftMintProcessor,
    // Lightweight posting worker (concurrency: 10 — set in @Processor decorator)
    ClipPostingProcessor,
    CloudinaryService,
    ClipsGateway,
    NftMintService,
    RoyaltyConfigurationService,
    AyrshareService,
    ClipPublishService,
    QueueRateLimitGuard,
    // Overflow protection: delays excess jobs instead of dropping them
    QueueOverflowService,
  ],
  exports: [
    ClipsService,
    CloudinaryService,
    ClipsGateway,
    NftMintService,
    ClipPublishService,
    QueueOverflowService,
  ],
})
export class ClipsModule {}
