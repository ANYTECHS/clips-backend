import { Module } from '@nestjs/common';
import { EarningsService } from './earnings.service';
import { EarningsAggregationService } from './earnings-aggregation.service';
import { EarningsExportService } from './earnings-export.service';
import { EarningsController } from './earnings.controller';
import { AnomalyDetectionService } from './anomaly-detection.service';
import { AnomalyDetectionProcessor } from './anomaly-detection.processor';
import { EarningsGateway } from './earnings.gateway';
import { EarningsGatewayModule } from './earnings.gateway.module';
import { LeaderboardService } from './leaderboard.service';
import { CurrencyConversionService } from './currency-conversion.service';
import { TaxReportExportService } from './tax-report-export.service';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '../redis/redis.module';
import { ConfigModule } from '../config/config.module';
import { CommonModule } from '../common/common.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    PrismaModule,
    RedisModule,
    ConfigModule,
    CommonModule,
    AuthModule,
    EarningsGatewayModule,
  ],
  controllers: [EarningsController],
  providers: [
    EarningsService,
    EarningsAggregationService,
    EarningsExportService,
    AnomalyDetectionService,
    AnomalyDetectionProcessor,
    LeaderboardService,
    CurrencyConversionService,
    TaxReportExportService,
  ],
  exports: [
    EarningsService,
    EarningsAggregationService,
    EarningsExportService,
    AnomalyDetectionService,
    LeaderboardService,
    EarningsGateway,
  ],
})
export class EarningsModule {}
