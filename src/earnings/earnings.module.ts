import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { EarningsService } from './earnings.service';
import { MonthlyEarningsCronService } from './monthly-earnings-cron.service';

/**
 * EarningsModule — earnings aggregation, anomaly queue constants,
 * and the monthly summary cron job (Issue #779).
 */
@Module({
  imports: [PrismaModule],
  providers: [EarningsService, MonthlyEarningsCronService],
  exports: [EarningsService],
})
export class EarningsModule {}
