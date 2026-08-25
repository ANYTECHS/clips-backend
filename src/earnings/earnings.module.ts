import { Module } from '@nestjs/common';
import { EarningsService } from './earnings.service';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '../redis/redis.module';
import { ConfigModule } from '../config/config.module';

@Module({
  imports: [PrismaModule, RedisModule, ConfigModule],
  providers: [EarningsService],
  exports: [EarningsService],
})
export class EarningsModule {}