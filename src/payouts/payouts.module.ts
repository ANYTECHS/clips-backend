import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PayoutsController } from './payouts.controller';
import { PayoutsService } from './payouts.service';
import { FeeService } from './fee.service';
import { PayoutReceiptService } from './payout-receipt.service';
import { PAYOUT_RETRY_QUEUE } from './payout-retry.queue';
import { PrismaModule } from '../prisma/prisma.module';
import { StellarModule } from '../stellar/stellar.module';

@Module({
  imports: [
    PrismaModule,
    StellarModule,
    BullModule.registerQueue({ name: PAYOUT_RETRY_QUEUE }),
  ],
  controllers: [PayoutsController],
  providers: [PayoutsService, FeeService, PayoutReceiptService],
  exports: [PayoutsService, FeeService],
})
export class PayoutsModule {}
