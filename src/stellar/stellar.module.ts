import { Module } from '@nestjs/common';
import { StellarService } from './stellar.service';
import { StellarConfig } from './stellar.config';
import { StellarPaymentListener } from './stellar-payment.listener';
import { PrismaModule } from '../prisma/prisma.module';
import { CircuitBreakerModule } from '../common/circuit-breaker/circuit-breaker.module';

@Module({
  imports: [PrismaModule, CircuitBreakerModule],
  providers: [StellarService, StellarConfig, StellarPaymentListener],
  exports: [StellarService, StellarConfig, StellarPaymentListener],
})
export class StellarModule {}
