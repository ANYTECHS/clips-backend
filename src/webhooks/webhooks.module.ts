import { Module } from '@nestjs/common';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';
import { PrismaModule } from '../prisma/prisma.module';
import { EarningsModule } from '../earnings/earnings.module';

@Module({
  imports: [PrismaModule, EarningsModule],
  controllers: [WebhooksController],
  providers: [WebhooksService],
})
export class WebhooksModule {}
