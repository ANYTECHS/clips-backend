import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { RedisModule } from '../redis/redis.module';
import { QueueModule } from '../queue/queue.module';
import { RedisMemoryService } from './redis-memory.service';
import { HealthController } from './health.controller';
import { QueueHealthService } from '../queue/queue-health.service';
import { RetryBackoffConfigService } from '../queue/retry-backoff-config.service';

@Module({
  imports: [
    RedisModule,
    QueueModule,
    ScheduleModule.forRoot(),
  ],
  controllers: [HealthController],
  providers: [RedisMemoryService, QueueHealthService, RetryBackoffConfigService],
  exports: [RedisMemoryService, QueueHealthService, RetryBackoffConfigService],
})
export class HealthModule {}
