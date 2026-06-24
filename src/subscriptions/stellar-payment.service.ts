import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StellarService } from '../stellar/stellar.service';
import * as crypto from 'crypto';

interface CreatePaymentIntentDto {
  plan: string;
  asset: string;
  amount: number;
  walletId: string;
}

interface DetectedPayment {
  memo: string;
  amount: number;
  transactionId: string;
}

@Injectable()
export class StellarPaymentService {
  private readonly EXPIRY_MINUTES = 15;

  constructor(
    private readonly prisma: PrismaService,
    private readonly stellar: StellarService,
  ) {}

  async createPaymentIntent(userId: number, dto: CreatePaymentIntentDto) {
    const walletId = parseInt(dto.walletId, 10);
    const wallet = await this.prisma.wallet.findFirst({
      where: { userId, id: walletId, deletedAt: null },
    });

    if (!wallet) {
      throw new BadRequestException('Wallet not found for user');
    }

    const memo = crypto.randomBytes(8).toString('hex').toUpperCase();
    const expiresAt = new Date(Date.now() + this.EXPIRY_MINUTES * 60 * 1000);

    return this.prisma.stellarPaymentIntent.create({
      data: {
        userId,
        amount: dto.amount,
        asset: dto.asset,
        destination: wallet.address,
        memo,
        plan: dto.plan,
        expiresAt,
        status: 'pending',
      },
    });
  }

  async processDetectedPayment(payment: DetectedPayment): Promise<boolean> {
    // Idempotency: check if already processed
    const duplicate = await this.prisma.stellarPaymentIntent.findFirst({
      where: { transactionId: payment.transactionId },
    });
    if (duplicate) return true;

    const intent = await this.prisma.stellarPaymentIntent.findFirst({
      where: { memo: payment.memo, status: 'pending' },
    });

    if (!intent) return false;

    if (intent.expiresAt < new Date()) {
      await this.prisma.stellarPaymentIntent.update({
        where: { id: intent.id },
        data: { status: 'expired' },
      });
      return false;
    }

    if (Math.abs(intent.amount - payment.amount) > 0.001) {
      return false;
    }

    await this.prisma.stellarPaymentIntent.update({
      where: { id: intent.id },
      data: { status: 'completed', transactionId: payment.transactionId },
    });

    await this.prisma.subscription.create({
      data: {
        userId: intent.userId,
        plan: intent.plan,
        status: 'active',
        paymentMethod: 'stellar',
        startDate: new Date(),
        stellarTxHash: payment.transactionId,
        stellarMemo: intent.memo,
      },
    });

    return true;
  }

  async getPaymentIntents(userId: number) {
    return this.prisma.stellarPaymentIntent.findMany({ where: { userId } });
  }
}
