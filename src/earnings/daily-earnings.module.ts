import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '../redis/redis.module';
import { DailyEarningsAggregationService } from './daily-earnings-aggregation.service';
import { DailyEarningsProcessor } from './daily-earnings.processor';
import { DAILY_EARNINGS_QUEUE } from './daily-earnings.queue';

/**
 * Daily earnings aggregation (Issue #767).
 *
 * Kept separate from `EarningsModule` so the nightly roll-up has no dependency
 * on the read-path services — it talks to Prisma and Redis directly.
 */
@Module({
  imports: [
    PrismaModule,
    RedisModule,
    BullModule.registerQueue({ name: DAILY_EARNINGS_QUEUE }),
  ],
  providers: [DailyEarningsAggregationService, DailyEarningsProcessor],
  exports: [DailyEarningsAggregationService],
})
export class DailyEarningsModule {}
