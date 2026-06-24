import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { JwtModule } from '@nestjs/jwt';
import { ClipsController } from './clips.controller';
import { ClipsService } from './clips.service';
import { ClipGenerationProcessor } from './clip-generation.processor';
import { CloudinaryService } from './cloudinary.service';
import { CLIP_GENERATION_QUEUE } from './clip-generation.queue';
import { NFT_MINT_QUEUE } from './nft-mint.queue';
import { NftMintProcessor } from './nft-mint.processor';
import { CLIP_POSTING_QUEUE } from './clip-posting.queue';
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
import { UserPlatformModule } from '../user-platform/user-platform.module';
import { AppConfigModule } from '../config/config.module';
import { AppConfigService } from '../config/app-config.service';

@Module({
  imports: [
    /**
     * Video-processing queue — CPU/memory intensive (FFmpeg, Cloudinary upload).
     * Concurrency is kept low (default 1) so the worker doesn't saturate the host.
     * Configured via the @Processor decorator on ClipGenerationProcessor.
     */
    BullModule.registerQueue({
      name: CLIP_GENERATION_QUEUE,
      defaultJobOptions: { priority: CLIP_GENERATION_QUEUE_PRIORITY },
    }),
    BullModule.registerQueue({
      name: NFT_MINT_QUEUE,
      defaultJobOptions: { priority: NFT_MINT_QUEUE_PRIORITY },
    }),
    PrismaModule,
    StellarModule,
    CircuitBreakerModule,
    RedisModule,

    /**
     * Posting queue — I/O-bound (Ayrshare HTTP calls, DB updates).
     * Higher concurrency is safe because jobs spend most of their time waiting
     * on network responses, not consuming CPU/memory.
     * Concurrency is configured via the @Processor decorator on ClipPostingProcessor.
     */
    BullModule.registerQueue({
      name: CLIP_POSTING_QUEUE,
      defaultJobOptions: { priority: CLIP_POSTING_QUEUE_PRIORITY },
    }),

    PrismaModule,
    StellarModule,
    CircuitBreakerModule,
    // JwtModule used by ClipsGateway to verify WebSocket handshake tokens
    JwtModule.registerAsync({
      imports: [AppConfigModule],
      inject: [AppConfigService],
      useFactory: (appConfig: AppConfigService) => ({
        secret: appConfig.jwtSecret,
        signOptions: { expiresIn: '7d' },
      }),
    }),
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
    AyrshareService,
    ClipPublishService,
    QueueRateLimitGuard,
  ],
  exports: [
    ClipsService,
    CloudinaryService,
    ClipsGateway,
    NftMintService,
    ClipPublishService,
  ],
})
export class ClipsModule {}
