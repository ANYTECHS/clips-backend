import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { StellarModule } from '../stellar/stellar.module';
import { NftFreezeController, SorobanController } from './soroban.controller';
import { SorobanService } from './soroban.service';

@Module({
  imports: [PrismaModule, StellarModule],
  controllers: [SorobanController, NftFreezeController],
  providers: [SorobanService],
  exports: [SorobanService],
})
export class SorobanModule {}
