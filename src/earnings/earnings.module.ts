import { Module } from '@nestjs/common';
import { EarningsService } from './earnings.service';
import { AnomalyDetectionService } from './anomaly-detection.service';
import { AnomalyDetectionProcessor } from './anomaly-detection.processor';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '../redis/redis.module';
import { ConfigModule } from '../config/config.module';

@Module({
  imports: [PrismaModule, RedisModule, ConfigModule],
  providers: [EarningsService, AnomalyDetectionService, AnomalyDetectionProcessor],
  exports: [EarningsService, AnomalyDetectionService],
})
export class EarningsModule {}