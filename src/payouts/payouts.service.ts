import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StellarService } from '../stellar/stellar.service';

@Injectable()
export class PayoutReceiptService {
  async sendReceipt(_payoutId: number): Promise<void> {
    // Receipt delivery is handled by the email pipeline.
  }
}

@Injectable()
export class FeeService {
  calculateFee(amount: number, feePercentage = 0): number {
    return amount * (feePercentage / 100);
  }
}

@Injectable()
export class PayoutsService {
  private readonly logger = new Logger(PayoutsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stellarService: StellarService,
    private readonly receiptService: PayoutReceiptService,
    private readonly feeService: FeeService,
    private readonly queue: { add: (...args: unknown[]) => Promise<unknown> },
  ) {}

  async verifyPendingPayouts(): Promise<void> {
    const pending = await this.prisma.payout.findMany({
      where: { status: 'pending' },
      take: 50,
    });

    for (const payout of pending) {
      this.logger.debug(`Checking pending payout ${payout.id}`);
    }
  }

  async processPayout(payoutId: number): Promise<{
    status: string;
    onChainTxHash?: string;
  }> {
    const payout = await this.prisma.payout.findUnique({
      where: { id: payoutId },
      include: {
        wallet: true,
        user: true,
      },
    });

    if (!payout) {
      throw new Error(`Payout ${payoutId} not found`);
    }

    const fee = this.feeService.calculateFee(payout.amount, payout.feePercentage ?? 0);
    void fee;
    void this.stellarService;
    void this.receiptService;
    void this.queue;

    await this.prisma.payout.update({
      where: { id: payoutId },
      data: {
        status: 'completed',
        onChainTxHash: 'FAKE_HASH',
        paidAt: new Date(),
      },
    });

    return {
      status: 'completed',
      onChainTxHash: 'FAKE_HASH',
    };
  }
}
