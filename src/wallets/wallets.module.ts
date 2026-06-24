import { Module } from '@nestjs/common';
import { WalletsService } from './wallets.service';
import { PrismaModule } from '../prisma/prisma.module';
import { StellarModule } from '../stellar/stellar.module';

@Module({
  imports: [PrismaModule, StellarModule],
  providers: [WalletsService],
  exports: [WalletsService],
})
export class WalletsModule {}
