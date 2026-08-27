import { Module } from '@nestjs/common';
import { EarningsService } from './earnings.service';
import { AnomalyDetectionService } from './anomaly-detection.service';
import { AnomalyDetectionProcessor } from './anomaly-detection.processor';
import { EarningsGateway } from './earnings.gateway';
import { EarningsGatewayModule } from './earnings.gateway.module';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '../redis/redis.module';
import { ConfigModule } from '../config/config.module';

@Module({
  imports: [PrismaModule, RedisModule, ConfigModule],
  providers: [EarningsService],
  exports: [EarningsService],
})
export class EarningsModule {}
  providers: [EarningsService, AnomalyDetectionService, AnomalyDetectionProcessor],
  exports: [EarningsService, AnomalyDetectionService],
})
export class EarningsModule {}
  imports: [PrismaModule, RedisModule, ConfigModule, EarningsGatewayModule],
  providers: [EarningsService],
  exports: [EarningsService, EarningsGateway],
})
export class EarningsModule {}
import { PrismaService } from '../prisma/prisma.service';
import { EarningsController } from './earnings.controller';
import { LeaderboardService } from './leaderboard.service';

@Module({
  controllers: [EarningsController],
  providers: [LeaderboardService, PrismaService],
  exports: [LeaderboardService],
import { EarningsService } from './earnings.service';
import { EarningsController } from './earnings.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '../redis/redis.module';
import { CommonModule } from '../common/common.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [PrismaModule, RedisModule, CommonModule, AuthModule],
  controllers: [EarningsController],
  providers: [EarningsService],
  exports: [EarningsService],
})
export class EarningsModule {}
