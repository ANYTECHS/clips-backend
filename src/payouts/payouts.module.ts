import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { StellarModule } from '../stellar/stellar.module';
import {
  FeeService,
  PayoutReceiptService,
  PayoutsService,
} from './payouts.service';
import { PrismaService } from '../prisma/prisma.service';
import { StellarService } from '../stellar/stellar.service';

@Module({
  imports: [PrismaModule, StellarModule],
  providers: [
    PayoutReceiptService,
    FeeService,
    {
      provide: PayoutsService,
      useFactory: (
        prisma: PrismaService,
        stellar: StellarService,
        receipt: PayoutReceiptService,
        fee: FeeService,
      ) =>
        new PayoutsService(prisma, stellar, receipt, fee, {
          add: async () => undefined,
        }),
      inject: [PrismaService, StellarService, PayoutReceiptService, FeeService],
    },
  ],
  exports: [PayoutsService, PayoutReceiptService, FeeService],
})
export class PayoutsModule {}
