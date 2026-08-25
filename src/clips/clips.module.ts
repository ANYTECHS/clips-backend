import { Module } from '@nestjs/common';
import { ClipsService } from './clips.service';
import { NftMintService } from './nft-mint.service';
import { PrismaModule } from '../prisma/prisma.module';
import { StellarModule } from '../stellar/stellar.module';

/**
 * ClipsModule — manages clip CRUD (ClipsService) and NFT mint lifecycle
 * (NftMintService).  NftMintService is exported so the NftModule can inject
 * it into NftController without creating a circular dependency.
 */
@Module({
  imports: [PrismaModule, StellarModule],
  providers: [ClipsService, NftMintService],
  exports: [ClipsService, NftMintService],
})
export class ClipsModule {}
