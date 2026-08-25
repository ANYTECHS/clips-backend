import { Module } from '@nestjs/common';
import { CurrencyService } from './services/currency.service';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [RedisModule],
  providers: [CurrencyService],
  exports: [CurrencyService],
})
export class CommonModule {}
