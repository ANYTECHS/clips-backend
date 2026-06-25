import { Module } from '@nestjs/common';
import { EarningsService } from './earnings.service';
import { EarningsAggregationService } from './earnings-aggregation.service';
import { EarningsExportService } from './earnings-export.service';
import { EarningsMetricsService } from './earnings-metrics.service';
import { EarningsController } from './earnings.controller';
import { AdminAnomaliesController } from './admin.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AnomalyDetectionService } from './anomaly-detection.service';
import { AnomalyDetectionProcessor } from './anomaly-detection.processor';
import { ANOMALY_DETECTION_QUEUE } from './anomaly-detection.queue';
import { AuthModule } from '../auth/auth.module';
import { CurrencyConversionService } from './currency-conversion.service';
import { TaxReportExportService } from './tax-report-export.service';
import { RedisModule } from '../redis/redis.module';
import { MonthlySummaryService } from './monthly-summary.service';
import { registerQueue } from '../common';

@Module({
  imports: [
    PrismaModule,
    registerQueue(ANOMALY_DETECTION_QUEUE),
    AuthModule,
    RedisModule,
  ],
  controllers: [EarningsController, AdminAnomaliesController],
  providers: [
    EarningsService,
    EarningsAggregationService,
    EarningsExportService,
    EarningsMetricsService,
    AnomalyDetectionService,
    AnomalyDetectionProcessor,
    CurrencyConversionService,
    TaxReportExportService,
    MonthlySummaryService,
  ],
  exports: [
    EarningsService,
    EarningsAggregationService,
    EarningsExportService,
    EarningsMetricsService,
    AnomalyDetectionService,
    CurrencyConversionService,
  ],
})
export class EarningsModule {}
