import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { StellarModule } from '../stellar/stellar.module';
import { CircuitBreakerModule } from '../common/circuit-breaker/circuit-breaker.module';
import { RoyaltyClaimHistoryService } from '../nft/royalty-claim-history.service';
import { SorobanIndexerService } from './soroban-indexer.service';
import { BlockchainController } from './blockchain.controller';
import { ContractPauseService } from './contract-pause.service';

@Module({
  imports: [PrismaModule, StellarModule, CircuitBreakerModule],
  controllers: [BlockchainController],
  providers: [
    SorobanIndexerService,
    RoyaltyClaimHistoryService,
    ContractPauseService,
  ],
  exports: [SorobanIndexerService, RoyaltyClaimHistoryService, ContractPauseService],
})
export class BlockchainModule {}
