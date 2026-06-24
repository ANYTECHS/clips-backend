import {
  Injectable,
  BadRequestException,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { StellarService } from '../stellar/stellar.service';
import { PayoutReceiptService } from './payout-receipt.service';
import { FeeService } from './fee.service';
import { PAYOUT_RETRY_QUEUE } from './payout-retry.queue';
import * as StellarSdk from '@stellar/stellar-sdk';

const MIN_PAYOUT_AMOUNT = parseFloat(process.env.MIN_PAYOUT_USD ?? '10');

interface RequestPayoutDto {
  amount: number;
  currency?: string;
  method: string;
  walletId?: number;
}

@Injectable()
export class PayoutsService {
  private readonly logger = new Logger(PayoutsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stellarService: StellarService,
    private readonly receiptService: PayoutReceiptService,
    private readonly feeService: FeeService,
    @InjectQueue(PAYOUT_RETRY_QUEUE) private readonly retryQueue: Queue,
  ) {}

  async requestPayout(userId: number, dto: RequestPayoutDto) {
    if (dto.amount < MIN_PAYOUT_AMOUNT) {
      throw new BadRequestException(
        `Minimum payout amount is ${MIN_PAYOUT_AMOUNT}`,
      );
    }

    const existing = await this.prisma.payout.findFirst({
      where: { userId, status: 'pending' },
    });
    if (existing) {
      throw new BadRequestException('A pending payout already exists');
    }

    const earningsAgg = await this.prisma.earning.aggregate({
      where: { clip: { video: { userId } } } as any,
      _sum: { amount: true },
    });
    const payoutsAgg = await this.prisma.payout.aggregate({
      where: { userId, status: { in: ['completed', 'pending'] } },
      _sum: { amount: true },
    });

    const totalEarned = earningsAgg._sum.amount ?? 0;
    const totalPaidOut = payoutsAgg._sum.amount ?? 0;
    const available = totalEarned - totalPaidOut;

    if (dto.amount > available) {
      throw new BadRequestException('Insufficient balance');
    }

    let walletId: number | null = null;
    if (dto.method === 'stellar') {
      const wallet = dto.walletId
        ? await this.prisma.wallet.findFirst({ where: { id: dto.walletId, userId } })
        : await this.prisma.wallet.findFirst({ where: { userId, deletedAt: null } });

      if (wallet) walletId = wallet.id;
    }

    const fee = await this.feeService.calculateFee(dto.amount, dto.method);

    const payout = await this.prisma.payout.create({
      data: {
        userId,
        walletId,
        amount: dto.amount,
        currency: dto.currency ?? 'USD',
        method: dto.method,
        status: 'pending',
        feeAmount: fee.feeAmount,
        feePercentage: fee.feePercentage,
        finalAmount: fee.finalAmount,
      },
    });

    return payout;
  }

  async processPayout(payoutId: number) {
    const payout = await this.prisma.payout.findUnique({
      where: { id: payoutId },
      include: { wallet: true, user: true },
    });

    if (!payout) throw new BadRequestException(`Payout ${payoutId} not found`);

    const platformSecret = process.env.STELLAR_PLATFORM_SECRET;
    if (!platformSecret) {
      throw new InternalServerErrorException('STELLAR_PLATFORM_SECRET not configured');
    }

    try {
      const keypair = StellarSdk.Keypair.fromSecret(platformSecret);
      const server = new StellarSdk.Horizon.Server(this.stellarService.horizonUrl);
      const sourceAccount = await server.loadAccount(keypair.publicKey());

      const tx = new StellarSdk.TransactionBuilder(sourceAccount, {
        fee: StellarSdk.BASE_FEE,
        networkPassphrase: this.stellarService.networkPassphrase,
      })
        .addOperation(
          StellarSdk.Operation.payment({
            destination: payout.wallet?.address ?? payout.user.stellarPublicKey ?? '',
            asset: StellarSdk.Asset.native(),
            amount: String(payout.finalAmount ?? payout.amount),
          }),
        )
        .setTimeout(180)
        .build();

      tx.sign(keypair);

      const result = await server.submitTransaction(tx);

      await this.prisma.payout.update({
        where: { id: payoutId },
        data: {
          status: 'completed',
          onChainTxHash: (result as any).hash,
          confirmedAt: new Date(),
          paidAt: new Date(),
        },
      });

      if (payout.user.email) {
        void this.receiptService.generateAndSendReceipt(payoutId, payout.user.email);
      }

      return { status: 'completed', onChainTxHash: (result as any).hash };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Payout ${payoutId} failed: ${message}`);

      await this.prisma.payout.update({
        where: { id: payoutId },
        data: {
          status: 'failed',
          retryCount: { increment: 1 },
          lastAttemptAt: new Date(),
        },
      });

      throw new InternalServerErrorException(`Payout processing failed: ${message}`);
    }
  }
}
