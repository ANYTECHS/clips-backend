import { Module } from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import { TransactionsController } from './transactions.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { StellarModule } from '../stellar/stellar.module';
import { EncryptionModule } from '../encryption/encryption.module';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [PrismaModule, StellarModule, EncryptionModule, RedisModule],
  providers: [TransactionsService],
  controllers: [TransactionsController],
})
export class TransactionsModule {}
