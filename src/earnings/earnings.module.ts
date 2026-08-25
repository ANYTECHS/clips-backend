import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '../redis/redis.module';
import { ConfigModule } from '../config/config.module';
import { EarningsService } from './earnings.service';
import { EarningsAggregationService } from './earnings-aggregation.service';
import { EarningsExportService } from './earnings-export.service';
import { CurrencyConversionService } from './currency-conversion.service';
import { TaxReportExportService } from './tax-report-export.service';

@Module({
  imports: [PrismaModule, RedisModule, ConfigModule],
  providers: [
    EarningsService,
    EarningsAggregationService,
    EarningsExportService,
    CurrencyConversionService,
    TaxReportExportService,
  ],
  exports: [
    EarningsService,
    EarningsAggregationService,
    EarningsExportService,
    CurrencyConversionService,
    TaxReportExportService,
  ],
})
export class EarningsModule {}
