import { Module } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import { RedisModule } from '../../redis/redis.module';
import { ThrottlerStorageRedisService } from './throttler-storage-redis.service';

/**
 * Provides ThrottlerStorageRedisService under the ThrottlerStorage token
 * so ThrottlerModule.forRootAsync can import and inject it as its backing store.
 */
@Module({
  imports: [RedisModule],
  providers: [
    ThrottlerStorageRedisService,
    {
      provide: ThrottlerStorage,
      useExisting: ThrottlerStorageRedisService,
    },
  ],
  exports: [ThrottlerStorage, ThrottlerStorageRedisService],
})
export class ThrottlerRedisModule {}
