import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { StellarModule } from '../stellar/stellar.module';
import { WalletsService } from './wallets.service';

@Module({
  imports: [PrismaModule, StellarModule],
  providers: [WalletsService],
  exports: [WalletsService],
})
export class WalletsModule {}
