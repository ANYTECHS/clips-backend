import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ConfigModule } from '@nestjs/config';
import { StellarPaymentService } from './stellar-payment.service';
import { StellarWebhookService } from './stellar-webhook.service';
import { SubscriptionsController } from './subscriptions.controller';
import { CircuitBreakerModule } from '../common/circuit-breaker/circuit-breaker.module';

@Module({
  imports: [PrismaModule, ConfigModule, CircuitBreakerModule],
  controllers: [SubscriptionsController],
  providers: [StellarPaymentService, StellarWebhookService],
  exports: [StellarPaymentService, StellarWebhookService],
})
export class SubscriptionsModule {}
