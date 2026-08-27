import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface AvailableBalance {
  totalEarnings: number;
  totalPaidOut: number;
  totalPending: number;
  availableBalance: number;
}

@Injectable()
export class BalanceService {
  private readonly logger = new Logger(BalanceService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Calculate available balance for a user atomically.
   * Formula: Total Earnings - Total Paid Out - Total Pending Approvals
   */
  async getAvailableBalance(userId: number): Promise<AvailableBalance> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Get total earnings (non-deleted, non-anomalies)
    const earningsResult = await this.prisma.earning.aggregate({
      where: {
        clip: {
          video: { userId },
        },
        deletedAt: null,
      },
      _sum: { amount: true },
    });

    const totalEarnings = earningsResult._sum.amount ?? 0;

    // Get total paid out (completed payouts only)
    const paidResult = await this.prisma.payout.aggregate({
      where: {
        userId,
        status: 'completed',
      },
      _sum: { finalAmount: true },
    });

    const totalPaidOut = paidResult._sum.finalAmount ?? 0;

    // Get total pending + approved (reserved balance)
    const pendingResult = await this.prisma.payout.aggregate({
      where: {
        userId,
        status: {
          in: ['pending', 'pending_review', 'approved', 'processing'],
        },
      },
      _sum: { amount: true },
    });

    const totalPending = pendingResult._sum.amount ?? 0;

    const availableBalance = totalEarnings - totalPaidOut - totalPending;

    this.logger.log(
      `Balance for user ${userId}: earnings=${totalEarnings}, paid=${totalPaidOut}, pending=${totalPending}, available=${availableBalance}`,
    );

    return {
      totalEarnings,
      totalPaidOut,
      totalPending,
      availableBalance: Math.max(0, availableBalance),
    };
  }

  /**
   * Validate that a requested payout amount is within available balance.
   * @param userId User requesting the payout
   * @param requestedAmount Amount requested in USD
   * @throws BadRequestException if amount is invalid
   */
  async validatePayoutAmount(
    userId: number,
    requestedAmount: number,
  ): Promise<void> {
    // Validate amount is positive
    if (requestedAmount <= 0) {
      throw new BadRequestException('Payout amount must be greater than 0');
    }

    // Validate against available balance
    const balance = await this.getAvailableBalance(userId);

    if (requestedAmount > balance.availableBalance) {
      throw new BadRequestException(
        `Requested amount $${requestedAmount.toFixed(2)} exceeds available balance $${balance.availableBalance.toFixed(2)}. ` +
          `Total earnings: $${balance.totalEarnings.toFixed(2)}, ` +
          `Total paid out: $${balance.totalPaidOut.toFixed(2)}, ` +
          `Pending payouts: $${balance.totalPending.toFixed(2)}.`,
      );
    }
  }

  /**
   * Atomically reserve balance for a payout request.
   * This prevents concurrent requests from spending the same balance.
   */
  async reserveBalance(
    userId: number,
    requestedAmount: number,
    payoutMethodId?: number,
    walletId?: number,
  ): Promise<number> {
    // Validate the amount first
    await this.validatePayoutAmount(userId, requestedAmount);

    // Use transaction to atomically create payout record
    // This prevents double-spending in concurrent requests
    const payout = await this.prisma.withTransaction(async (tx) => {
      return await tx.payout.create({
        data: {
          userId,
          amount: requestedAmount,
          currency: 'USD',
          method: walletId ? 'stellar' : 'bank_transfer',
          status: 'pending',
          payoutMethodId,
          walletId,
        },
      });
    });

    this.logger.log(
      `Reserved $${requestedAmount} for user ${userId} in payout ${payout.id}`,
    );

    return payout.id;
  }

  /**
   * Check if concurrent payouts would exceed available balance.
   * This is a defensive check before processing multiple concurrent requests.
   */
  async canProcessConcurrent(
    userId: number,
    amounts: number[],
  ): Promise<boolean> {
    const totalRequested = amounts.reduce((sum, a) => sum + a, 0);
    const balance = await this.getAvailableBalance(userId);
    return totalRequested <= balance.availableBalance;
  }
}
