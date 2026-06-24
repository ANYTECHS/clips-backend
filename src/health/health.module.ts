import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { RedisModule } from '../redis/redis.module';
import { RedisMemoryService } from './redis-memory.service';
import { HealthController } from './health.controller';

@Module({
  imports: [
    RedisModule,
    ScheduleModule.forRoot(),
  ],
  controllers: [HealthController],
  providers: [RedisMemoryService],
  exports: [RedisMemoryService],
})
export class HealthModule {}
