import { Module } from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import { PrismaModule } from '../prisma/prisma.module';
import { StellarModule } from '../stellar/stellar.module';
import { EncryptionModule } from '../encryption/encryption.module';

@Module({
  imports: [PrismaModule, StellarModule, EncryptionModule],
  providers: [TransactionsService],
  exports: [TransactionsService],
})
export class TransactionsModule {}
