import { Module } from '@nestjs/common';
import { CircuitBreakerModule } from '../common/circuit-breaker/circuit-breaker.module';
import { ConfigModule } from '../config/config.module';
import { ClipsModule } from '../clips/clips.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { StellarModule } from '../stellar/stellar.module';
import { IpfsUploadService } from './ipfs-upload.service';
import { NftOwnershipService } from './nft-ownership.service';
import { NftController } from './nft.controller';
import { NftMintGuard } from './guards/nft-mint.guard';

@Module({
  imports: [
    CircuitBreakerModule,
    ConfigModule,
    ClipsModule,
    PrismaModule,
    AuthModule,
    StellarModule,
  ],
  controllers: [NftController],
  providers: [IpfsUploadService, NftOwnershipService, NftMintGuard],
  exports: [IpfsUploadService, NftOwnershipService, NftMintGuard],
})
export class NftModule {}
