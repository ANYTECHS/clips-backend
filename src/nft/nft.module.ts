import { Module } from '@nestjs/common';
import { IpfsUploadModule } from './ipfs-upload.module';
import { NftOwnershipModule } from './nft-ownership.module';
import { NftConfig } from './nft.config';
import { NftService } from './nft.service';
import { NftController } from './nft.controller';
import { NftMetadataService } from './nft-metadata.service';
import { RoyaltyQueryService } from './royalty-query.service';
import { PlatformRevenueService } from './platform-revenue.service';
import { PlatformRevenueController } from './platform-revenue.controller';
import { BatchRoyaltyService } from './batch-royalty.service';
import { BatchRoyaltyController } from './batch-royalty.controller';
import { NftMintService } from '../clips/nft-mint.service';
import { RoyaltyConfigurationService } from './royalty-configuration.service';
import { NftMintGuard } from './guards/nft-mint.guard';
import { PrismaModule } from '../prisma/prisma.module';
import { StellarModule } from '../stellar/stellar.module';
import { CircuitBreakerModule } from '../common/circuit-breaker/circuit-breaker.module';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [
    PrismaModule,
    StellarModule,
    CircuitBreakerModule,
    IpfsUploadModule,
    NftOwnershipModule,
    RedisModule,
  ],
  providers: [
    NftConfig,
    NftService,
    NftMintService,
    NftMetadataService,
    RoyaltyQueryService,
    PlatformRevenueService,
    BatchRoyaltyService,
    NftMintGuard,
    RoyaltyConfigurationService,
  ],
  controllers: [
    NftController,
    PlatformRevenueController,
    BatchRoyaltyController,
  ],
  exports: [
    NftService,
    NftMintService,
    NftMetadataService,
    RoyaltyQueryService,
    PlatformRevenueService,
    BatchRoyaltyService,
    IpfsUploadModule,
    NftOwnershipModule,
    RoyaltyConfigurationService,
  ],
})
export class NftModule {}
