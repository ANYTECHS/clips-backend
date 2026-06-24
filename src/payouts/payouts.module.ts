import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PayoutsService } from './payouts.service';
import { PayoutReceiptService } from './payout-receipt.service';
import { PayoutsController } from './payouts.controller';
import { AdminPayoutsController } from './admin.controller';
import { AdminFeesController } from './fees.controller';
import { FeeService } from './fee.service';
import { PayoutMethodService } from './payout-method.service';
import { PayoutMethodController } from './payout-method.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { StellarModule } from '../stellar/stellar.module';
import { AuthModule } from '../auth/auth.module';
import { EncryptionModule } from '../encryption/encryption.module';
import { MetricsModule } from '../metrics/metrics.module';
import { PayoutRetryProcessor } from './payout-retry.processor';
import { PAYOUT_RETRY_QUEUE, PAYOUT_RETRY_QUEUE_PRIORITY } from './payout-retry.queue';
import { PayoutApprovalService } from './payout-approval.service';

@Module({
  imports: [
    PrismaModule,
    StellarModule,
    AuthModule,
    EncryptionModule,
    MetricsModule,
    BullModule.registerQueue({
      name: PAYOUT_RETRY_QUEUE,
      defaultJobOptions: { priority: PAYOUT_RETRY_QUEUE_PRIORITY },
    }),
  ],
  controllers: [
    PayoutsController,
    AdminPayoutsController,
    AdminFeesController,
    PayoutMethodController,
  ],
  providers: [
    PayoutsService,
    PayoutReceiptService,
    FeeService,
    PayoutMethodService,
    PayoutRetryProcessor,
    PayoutApprovalService,
  ],
  exports: [PayoutsService, FeeService, PayoutMethodService],
})
export class PayoutsModule {}
