import { Module } from '@nestjs/common';
import { StellarPaymentService } from './stellar-payment.service';
import { PrismaModule } from '../prisma/prisma.module';
import { StellarModule } from '../stellar/stellar.module';

@Module({
  imports: [PrismaModule, StellarModule],
  providers: [StellarPaymentService],
  exports: [StellarPaymentService],
})
export class SubscriptionsModule {}
