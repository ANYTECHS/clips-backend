import { Module } from '@nestjs/common';
import { NftConfig } from './nft.config';
import { NftService } from './nft.service';
import { NftController } from './nft.controller';
import { RoyaltyQueryService } from './royalty-query.service';
import { PlatformRevenueService } from './platform-revenue.service';
import { PlatformRevenueController } from './platform-revenue.controller';
import { BatchRoyaltyService } from './batch-royalty.service';
import { BatchRoyaltyController } from './batch-royalty.controller';
import { NftMintService } from '../clips/nft-mint.service';
import { NftOwnershipService } from './nft-ownership.service';
import { SorobanContractService } from './soroban-contract.service';
import { SorobanPauseController } from './soroban-pause.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { StellarModule } from '../stellar/stellar.module';
import { CircuitBreakerModule } from '../common/circuit-breaker/circuit-breaker.module';

@Module({
  imports: [PrismaModule, StellarModule, CircuitBreakerModule],
  providers: [
    NftConfig,
    NftService,
    NftMintService,
    RoyaltyQueryService,
    NftOwnershipService,
    PlatformRevenueService,
    BatchRoyaltyService,
    SorobanContractService,
  ],
  controllers: [
    NftController,
    PlatformRevenueController,
    BatchRoyaltyController,
    SorobanPauseController,
  ],
  exports: [
    NftService,
    NftMintService,
    RoyaltyQueryService,
    NftOwnershipService,
    PlatformRevenueService,
    BatchRoyaltyService,
  ],
})
export class NftModule {}
