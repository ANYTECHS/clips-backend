import { Module } from '@nestjs/common';
import { ClipsController } from './clips.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { StellarModule } from '../stellar/stellar.module';
import { CircuitBreakerModule } from '../common/circuit-breaker/circuit-breaker.module';
import { IpfsUploadModule } from '../nft/ipfs-upload.module';
import { NftConfig } from '../nft/nft.config';
import { NftMetadataService } from '../nft/nft-metadata.service';
import { RoyaltyConfigurationService } from '../nft/royalty-configuration.service';
import { CloudinaryService } from './cloudinary.service';
import { NftMintService } from './nft-mint.service';
import { ClipsService } from './clips.service';
import { ClipsController } from './clips.controller';

@Module({
  imports: [PrismaModule, StellarModule, CircuitBreakerModule, IpfsUploadModule],
  providers: [
    CloudinaryService,
    NftConfig,
    RoyaltyConfigurationService,
    NftMetadataService,
    NftMintService,
    ClipsService,
  ],
  controllers: [ClipsController],
  exports: [CloudinaryService, NftMintService, ClipsService],

@Module({
  imports: [PrismaModule, StellarModule, CircuitBreakerModule, IpfsUploadModule],
  providers: [CloudinaryService, NftConfig, RoyaltyConfigurationService, NftMetadataService, NftMintService],
  exports: [CloudinaryService, NftMintService],
import { ClipsService } from './clips.service';
import { CloudinaryService } from './cloudinary.service';
import { PrismaModule } from '../prisma/prisma.module';
import { registerQueue } from '../common';
import { CLIP_GENERATION_QUEUE } from './clip-generation.queue';

@Module({
  imports: [PrismaModule, registerQueue(CLIP_GENERATION_QUEUE)],
  imports: [PrismaModule],
  controllers: [ClipsController],
  providers: [ClipsService, CloudinaryService],
  exports: [ClipsService, CloudinaryService],
})
export class ClipsModule {}
