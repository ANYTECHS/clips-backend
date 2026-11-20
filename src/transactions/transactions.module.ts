import { Module } from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import { TransactionsController } from './transactions.controller';
import { TransactionConfirmationService } from './transaction-confirmation.service';
import { PrismaModule } from '../prisma/prisma.module';
import { StellarModule } from '../stellar/stellar.module';
import { EncryptionModule } from '../encryption/encryption.module';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [PrismaModule, StellarModule, EncryptionModule, RedisModule],
  providers: [TransactionsService, TransactionConfirmationService],
  controllers: [TransactionsController],
  exports: [TransactionConfirmationService],
})
export class TransactionsModule {}
