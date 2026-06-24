import { Module } from '@nestjs/common';
import { CircuitBreakerModule } from '../common/circuit-breaker/circuit-breaker.module';
import { ConfigModule } from '../config/config.module';
import { ClipsModule } from '../clips/clips.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { IpfsUploadService } from './ipfs-upload.service';
import { NftController } from './nft.controller';
import { NftMintGuard } from './guards/nft-mint.guard';

@Module({
  imports: [
    CircuitBreakerModule,
    ConfigModule,
    ClipsModule,
    PrismaModule,
    AuthModule,
  ],
  controllers: [NftController],
  providers: [IpfsUploadService, NftMintGuard],
  exports: [IpfsUploadService, NftMintGuard],
})
export class NftModule {}
