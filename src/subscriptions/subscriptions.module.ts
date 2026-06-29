import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ConfigModule } from '@nestjs/config';
import { StellarPaymentService } from './stellar-payment.service';
import { StellarWebhookService } from './stellar-webhook.service';
import { SubscriptionsController } from './subscriptions.controller';
import { StellarWebhookController } from './stellar-webhook.controller';
import { CircuitBreakerModule } from '../common/circuit-breaker/circuit-breaker.module';
import { raw } from 'body-parser';

@Module({
  imports: [PrismaModule, ConfigModule, CircuitBreakerModule],
  controllers: [SubscriptionsController, StellarWebhookController],
  providers: [StellarPaymentService, StellarWebhookService],
  exports: [StellarPaymentService, StellarWebhookService],
})
export class SubscriptionsModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Apply raw body parser only to the Stellar webhook endpoint
    consumer
      .apply(raw({ type: '*/*' }))
      .forRoutes('webhooks/stellar');
  }
}
