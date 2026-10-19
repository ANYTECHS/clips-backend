import { Module } from '@nestjs/common';
import { CircuitBreakerModule } from '../common/circuit-breaker/circuit-breaker.module';
import { ConfigModule } from '../config/config.module';
import { StellarModule } from '../stellar/stellar.module';
import { NftOwnershipService } from './nft-ownership.service';
import { NftOwnershipVerificationService } from './nft-ownership-verification.service';
import { NftOwnershipGuard } from './guards/nft-ownership.guard';
import { OwnershipService } from './ownership.service';

@Module({
  imports: [StellarModule, CircuitBreakerModule, ConfigModule],
  providers: [
    NftOwnershipService,
    NftOwnershipVerificationService,
    NftOwnershipGuard,
    OwnershipService,
  ],
  exports: [
    NftOwnershipService,
    NftOwnershipVerificationService,
    NftOwnershipGuard,
    OwnershipService,
  ],
})
export class NftOwnershipModule {}

