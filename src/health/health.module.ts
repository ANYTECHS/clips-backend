import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { RedisModule } from '../redis/redis.module';
import { QueueModule } from '../queue/queue.module';
import { StellarModule } from '../stellar/stellar.module';
import { CircuitBreakerModule } from '../common/circuit-breaker/circuit-breaker.module';
import { RedisMemoryService } from './redis-memory.service';
import { HealthController } from './health.controller';
import { SorobanHealthService } from './soroban-health.service';
import { QueueHealthService } from '../queue/queue-health.service';
import { RetryBackoffConfigService } from '../queue/retry-backoff-config.service';

@Module({
  imports: [
    RedisModule,
    QueueModule,
    StellarModule,
    CircuitBreakerModule,
    ScheduleModule.forRoot(),
  ],
  controllers: [HealthController],
  providers: [
    RedisMemoryService,
    QueueHealthService,
    RetryBackoffConfigService,
    SorobanHealthService,
  ],
  exports: [
    RedisMemoryService,
    QueueHealthService,
    RetryBackoffConfigService,
    SorobanHealthService,
  ],
})
export class HealthModule {}
