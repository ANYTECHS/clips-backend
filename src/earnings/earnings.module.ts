import { Module } from '@nestjs/common';
import { EarningsService } from './earnings.service';
import { EarningsGateway } from './earnings.gateway';
import { EarningsGatewayModule } from './earnings.gateway.module';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '../redis/redis.module';
import { ConfigModule } from '../config/config.module';

@Module({
  imports: [PrismaModule, RedisModule, ConfigModule, EarningsGatewayModule],
  providers: [EarningsService],
  exports: [EarningsService, EarningsGateway],
})
export class EarningsModule {}