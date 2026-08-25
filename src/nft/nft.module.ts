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
import { ClipRoyaltyService } from './clip-royalty.service';
import { ClipRoyaltyController } from './clip-royalty.controller';
import { NftMintService } from '../clips/nft-mint.service';
import { ClipsModule } from '../clips/clips.module';
import { RoyaltyConfigurationService } from './royalty-configuration.service';
import { NftMintGuard } from './guards/nft-mint.guard';
import { MintSignatureVerificationService } from './mint-signature-verification.service';
import { AdminContractService } from './admin-contract.service';
import { PrismaModule } from '../prisma/prisma.module';
import { StellarModule } from '../stellar/stellar.module';
import { CircuitBreakerModule } from '../common/circuit-breaker/circuit-breaker.module';
import { GasMetricsService } from './gas-metrics.service';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [
    PrismaModule,
    StellarModule,
    CircuitBreakerModule,
    IpfsUploadModule,
    NftOwnershipModule,
    RedisModule,
    ClipsModule,
  ],
  providers: [
    NftConfig,
    NftService,
    GasMetricsService,
    NftMintService,
    NftMetadataService,
    RoyaltyQueryService,
    PlatformRevenueService,
    BatchRoyaltyService,
    ClipRoyaltyService,
    NftMintGuard,
    RoyaltyConfigurationService,
    MintSignatureVerificationService,
    AdminContractService,
  ],
  controllers: [
    NftController,
    PlatformRevenueController,
    BatchRoyaltyController,
    ClipRoyaltyController,
  ],
  exports: [
    NftService,
    GasMetricsService,
    NftMintService,
    NftMetadataService,
    RoyaltyQueryService,
    PlatformRevenueService,
    BatchRoyaltyService,
    ClipRoyaltyService,
    IpfsUploadModule,
    NftOwnershipModule,
    RoyaltyConfigurationService,
    MintSignatureVerificationService,
  ],
})
export class NftModule {}
