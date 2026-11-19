import { Module } from '@nestjs/common';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';
import { WebhooksGateway } from './webhooks.gateway';
import { PrismaModule } from '../prisma/prisma.module';
import { EarningsModule } from '../earnings/earnings.module';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [PrismaModule, EarningsModule, RedisModule],
  controllers: [WebhooksController],
  providers: [WebhooksService, WebhooksGateway],
  exports: [WebhooksService],
})
export class WebhooksModule {}
