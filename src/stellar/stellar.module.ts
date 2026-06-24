import { Module } from '@nestjs/common';
import { StellarService } from './stellar.service';
import { StellarPaymentListenerService } from './stellar-payment-listener.service';
import { PrismaModule } from '../prisma/prisma.module';
import { CircuitBreakerModule } from '../common/circuit-breaker/circuit-breaker.module';

@Module({
  imports: [PrismaModule, CircuitBreakerModule],
  providers: [StellarService, StellarPaymentListenerService],
  exports: [StellarService, StellarPaymentListenerService],
})
export class StellarModule {}
