import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import * as StellarSdk from '@stellar/stellar-sdk';
import { PrismaService } from '../prisma/prisma.service';
import { StellarService } from '../stellar/stellar.service';
import { PayoutReceiptService } from './payout-receipt.service';
import { EarningsService } from '../earnings/earnings.service';
import { PAYOUT_RETRY_QUEUE, MAX_PAYOUT_RETRIES, PAYOUT_RETRY_BACKOFF_BASE } from './payout-retry.queue';
import { STELLAR_CONFIRMATION_MAX_POLLS } from './stellar-confirmation.queue';
import { FeeService } from './fee.service';
import { PayoutApprovalService } from './payout-approval.service';
import { ConfigService } from '../config/config.service';
import { PayoutLimitsService } from './payout-limits.service';
import { CurrencyService } from '../common/services/currency.service';

import { OPEN_PAYOUT_STATUSES } from './payouts.constants';
import { PayoutValidationService } from './payout-validation.service';
import { PayoutProcessingService } from './payout-processing.service';

@Injectable()
export class PayoutsService {
  private readonly logger = new Logger(PayoutsService.name);
  private readonly defaultPayoutCurrency =
    process.env.DEFAULT_PAYOUT_CURRENCY ?? 'USD';
  private readonly payoutLimitsService: PayoutLimitsService;

  constructor(
    private prisma: PrismaService,
    private earningsService: EarningsService,
    private stellarService: StellarService,
    private payoutReceiptService: PayoutReceiptService,
    private feeService: FeeService,
    private payoutApprovalService: PayoutApprovalService,
    private readonly config: ConfigService,
    payoutLimitsService: PayoutLimitsService,
    private readonly currencyService: CurrencyService,
    @InjectQueue(PAYOUT_RETRY_QUEUE) private payoutRetryQueue: Queue,
    private readonly payoutValidationService: PayoutValidationService,
    private readonly payoutProcessingService: PayoutProcessingService,
  ) {
    this.payoutLimitsService = payoutLimitsService;
  }

  /**
   * Enforce the minimum Stellar payout threshold (Issue #766).
   *
   * `MIN_STELLAR_PAYOUT` (default 5) is expressed as a *USD equivalent*, so a
   * payout denominated in another currency is converted before comparison —
   * otherwise 5 units of a weaker currency would clear a "5 USD" floor and the
   * micro-payout this threshold exists to prevent would go through anyway.
   */
  private async assertMinimumPayout(
    amount: number,
    currency?: string,
  ): Promise<void> {
    await this.payoutValidationService.assertMinimumPayout(amount, currency);
  }

  private async toUsdEquivalent(
    amount: number,
    currency: string,
  ): Promise<number> {
    return this.payoutValidationService['toUsdEquivalent'](amount, currency);
  }

  private assertPayoutLimits(amount: number, currency: string): void {
    this.payoutValidationService.assertPayoutLimits(amount, currency);
  }

  private getPlatformWalletAddress(): string {
    return (
      process.env.STELLAR_WALLET_ADDRESS ||
      process.env.PLATFORM_WALLET_ADDRESS ||
      ''
    );
  }

  async initiateStellarPayout(
    userId: number,
    payoutId: number,
    amount: number,
  ): Promise<{
    id: number;
    status: string;
    amount: number;
    transactionId: string;
    stellarXdr: string;
  }> {
    return this.payoutProcessingService.initiateStellarPayout(userId, payoutId, amount);
  }

  async requestPayout(userId: number): Promise<{
    id: number;
    amount: number;
    status: string;
    createdAt: Date;
    feeAmount?: number;
    finalAmount?: number;
  }> {
    const existingPending = await this.prisma.payout.findFirst({
      where: { userId, status: { in: [...OPEN_PAYOUT_STATUSES] } },
    });

    if (existingPending) {
      throw new ConflictException(
        'A payout request is already pending for this user',
      );
    }

    const wallet = await this.prisma.wallet.findFirst({
      where: { userId, chain: 'stellar', deletedAt: null },
    });

    if (!wallet) {
      throw new BadRequestException(
        'No active Stellar wallet found. Please connect a wallet first.',
      );
    }

    const currency = this.defaultPayoutCurrency;

    const payout = await this.prisma.$transaction(async (tx) => {
      const totalEarnings = await tx.earning.aggregate({
        where: { clip: { video: { userId } }, deletedAt: null },
        _sum: { amount: true },
      });

      const totalPaidOut = await tx.payout.aggregate({
        where: { userId, status: { in: ['completed', 'processing'] } },
        _sum: { amount: true },
      });

      const availableBalance =
        (totalEarnings._sum.amount ?? 0) - (totalPaidOut._sum.amount ?? 0);

      await this.assertMinimumPayout(availableBalance, currency);

      const fee = await this.feeService.calculateFee(availableBalance, 'stellar');
      const status = this.payoutApprovalService.resolveInitialStatus(availableBalance);

      return tx.payout.create({
        data: {
          userId,
          walletId: wallet.id,
          amount: availableBalance,
          currency,
          method: 'stellar',
          status,
          feeAmount: fee.feeAmount,
          feePercentage: fee.feePercentage,
          finalAmount: fee.finalAmount,
        },
      });
    });

    return {
      id: payout.id,
      amount: payout.amount,
      status: payout.status,
      createdAt: payout.createdAt,
      feeAmount: payout.feeAmount,
      finalAmount: payout.finalAmount,
    };
  }

  /**
   * Create one or more pending payout requests (Issues #980 / #981).
   *
   * Single-destination: pass `method`.
   * Split fiat/crypto: pass `destinations` whose percentages sum to 100
   * (or absolute amounts that sum to `amount`). Separate Payout rows are
   * created atomically inside a single DB transaction.
   */
  async requestPayoutWithDetails(
    userId: number,
    amount: number,
    currency: string,
    method?: 'fiat' | 'stellar',
    destinations?: Array<{
      method: 'fiat' | 'stellar';
      percentage?: number;
      amount?: number;
    }>,
  ): Promise<
    | {
        payoutId: string;
        status: string;
        id: number;
        amount: number;
        currency: string;
        method: string;
        createdAt: Date;
        feeAmount?: number;
        finalAmount?: number;
      }
    | {
        payouts: Array<{
          payoutId: string;
          status: string;
          id: number;
          amount: number;
          currency: string;
          method: string;
        }>;
        totalAmount: number;
        currency: string;
      }
  > {
    const normalizedCurrency = (currency ?? this.defaultPayoutCurrency).toUpperCase();
    const splits = this.resolvePayoutDestinations(amount, method, destinations);

    const existingPending = await this.prisma.payout.findFirst({
      where: { userId, status: { in: [...OPEN_PAYOUT_STATUSES] } },
    });

    if (existingPending) {
      throw new ConflictException(
        'A payout request is already pending for this user',
      );
    }

    await this.assertMinimumPayout(amount, normalizedCurrency);
    this.assertPayoutLimits(amount, normalizedCurrency);

    const earningsSummary = await this.earningsService.getUserTotalEarnings(userId);
    const availableBalance = earningsSummary.availableBalance;

    if (amount > availableBalance) {
      throw new BadRequestException(
        `Insufficient balance. Available: ${availableBalance} ${normalizedCurrency}`,
      );
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const rows = [];

      for (const split of splits) {
        const { walletId, payoutMethodId } = await this.resolveDestinationIds(
          userId,
          split.method,
          tx,
        );

        const feeCalculation = await this.feeService.calculateFee(
          split.amount,
          split.method,
        );

        // Issue #980: new requests start as pending.
        const payout = await tx.payout.create({
          data: {
            userId,
            walletId,
            payoutMethodId,
            amount: split.amount,
            currency: normalizedCurrency,
            method: split.method,
            status: 'pending',
            feeAmount: feeCalculation.feeAmount,
            feePercentage: feeCalculation.feePercentage,
            finalAmount: feeCalculation.finalAmount,
          },
        });

        rows.push(payout);
      }

      return rows;
    });

    this.logger.log(
      `Payout request(s) created for user ${userId}: ` +
        created.map((p) => `${p.id}:${p.method}:${p.amount}`).join(', '),
    );

    if (created.length === 1) {
      const payout = created[0];
      return {
        payoutId: `payout_${payout.id}`,
        status: payout.status,
        id: payout.id,
        amount: payout.amount,
        currency: payout.currency,
        method: payout.method,
        createdAt: payout.createdAt,
        feeAmount: payout.feeAmount ?? undefined,
        finalAmount: payout.finalAmount ?? undefined,
      };
    }

    return {
      payouts: created.map((payout) => ({
        payoutId: `payout_${payout.id}`,
        status: payout.status,
        id: payout.id,
        amount: payout.amount,
        currency: payout.currency,
        method: payout.method,
      })),
      totalAmount: amount,
      currency: normalizedCurrency,
    };
  }

  /**
   * Normalise a single-method or multi-destination request into concrete
   * per-destination amounts. Percentages must sum to 100 (±0.01); absolute
   * amounts must sum to the parent request amount.
   */
  private resolvePayoutDestinations(
    totalAmount: number,
    method?: 'fiat' | 'stellar',
    destinations?: Array<{
      method: 'fiat' | 'stellar';
      percentage?: number;
      amount?: number;
    }>,
  ): Array<{ method: 'fiat' | 'stellar'; amount: number }> {
    if (!destinations || destinations.length === 0) {
      if (!method) {
        throw new BadRequestException(
          'Either method or destinations is required',
        );
      }
      return [{ method, amount: totalAmount }];
    }

    const methods = new Set(destinations.map((d) => d.method));
    if (methods.size !== destinations.length) {
      throw new BadRequestException(
        'Duplicate destination methods are not allowed in a split payout',
      );
    }

    const usingPercentage = destinations.every(
      (d) => d.percentage !== undefined && d.percentage !== null,
    );
    const usingAmount = destinations.every(
      (d) => d.amount !== undefined && d.amount !== null,
    );

    if (!usingPercentage && !usingAmount) {
      throw new BadRequestException(
        'Each destination must specify either percentage or amount consistently',
      );
    }

    if (usingPercentage) {
      const percentSum = destinations.reduce(
        (sum, d) => sum + (d.percentage ?? 0),
        0,
      );
      if (Math.abs(percentSum - 100) > 0.01) {
        throw new BadRequestException(
          `Destination percentages must sum to 100. Received: ${percentSum}`,
        );
      }

      const splits = destinations.map((d, index) => {
        const raw = (totalAmount * (d.percentage ?? 0)) / 100;
        // Round intermediate legs to cents; put remainder on the last leg so
        // floating-point drift never creates a shortfall/overage.
        const amount =
          index === destinations.length - 1
            ? 0 // filled below
            : Math.round(raw * 100) / 100;
        return { method: d.method, amount };
      });
      const allocated = splits
        .slice(0, -1)
        .reduce((sum, s) => sum + s.amount, 0);
      splits[splits.length - 1].amount =
        Math.round((totalAmount - allocated) * 100) / 100;
      return splits;
    }

    const amountSum = destinations.reduce((sum, d) => sum + (d.amount ?? 0), 0);
    if (Math.abs(amountSum - totalAmount) > 0.01) {
      throw new BadRequestException(
        `Destination amounts must sum to ${totalAmount}. Received: ${amountSum}`,
      );
    }

    return destinations.map((d) => ({
      method: d.method,
      amount: d.amount as number,
    }));
  }

  private async resolveDestinationIds(
    userId: number,
    method: 'fiat' | 'stellar',
    tx: any,
  ): Promise<{ walletId: number | null; payoutMethodId: number | null }> {
    if (method === 'stellar') {
      const wallet = await tx.wallet.findFirst({
        where: { userId, chain: 'stellar', deletedAt: null },
      });

      if (!wallet) {
        throw new BadRequestException(
          'No active Stellar wallet found. Please connect a wallet first.',
        );
      }
      return { walletId: wallet.id, payoutMethodId: null };
    }

    const payoutMethod = await tx.payoutMethod.findFirst({
      where: { userId, isDefault: true, deletedAt: null },
    });

    if (!payoutMethod) {
      throw new BadRequestException(
        'No default payout method found. Please add a payout method first.',
      );
    }
    return { walletId: null, payoutMethodId: payoutMethod.id };
  }

  async getPayouts(
    userId: number,
    status?: string,
  ): Promise<any[]> {
    const filterStatus = this.parseStatusFilter(status);

    return this.prisma.payout.findMany({
      where: {
        userId,
        ...(filterStatus ? { status: filterStatus } : {}),
      },
      select: {
        id: true,
        amount: true,
        currency: true,
        method: true,
        status: true,
        transactionId: true,
        onChainTxHash: true,
        confirmedAt: true,
        retryCount: true,
        stellarXdr: true,
        feeAmount: true,
        feePercentage: true,
        finalAmount: true,
        paidAt: true,
        approvedAt: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getPayoutById(
    userId: number,
    payoutId: number,
  ): Promise<any> {
    const payout = await this.prisma.payout.findFirst({
      where: { id: payoutId, userId },
      select: {
        id: true,
        amount: true,
        currency: true,
        method: true,
        status: true,
        transactionId: true,
        onChainTxHash: true,
        confirmedAt: true,
        retryCount: true,
        stellarXdr: true,
        feeAmount: true,
        feePercentage: true,
        finalAmount: true,
        paidAt: true,
        approvedAt: true,
        rejectedAt: true,
        rejectionReason: true,
        lastAttemptAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!payout) {
      throw new NotFoundException('Payout record not found');
    }

    return payout;
  }

  private parseStatusFilter(status?: string): string | undefined {
    if (!status) {
      return undefined;
    }

    return status;
  }

  /**
   * Query Horizon directly for the real-time on-chain confirmation status
   * of a Stellar payout transaction.  Returns the DB record enriched with
   * live data from the Stellar network.
   */
  async getOnChainStatus(
    userId: number,
    payoutId: number,
  ): Promise<{
    id: number;
    status: string;
    onChainTxHash: string | null;
    confirmedAt: Date | null;
    onChain: {
      found: boolean;
      successful?: boolean;
      confirmedAt?: Date;
    };
  }> {
    const payout = await this.prisma.payout.findFirst({
      where: { id: payoutId, userId },
      select: {
        id: true,
        status: true,
        onChainTxHash: true,
        confirmedAt: true,
      },
    });

    if (!payout) {
      throw new NotFoundException('Payout record not found');
    }

    let onChain = { found: false as const };

    if (payout.onChainTxHash && payout.method === 'stellar') {
      try {
        const result = await this.stellarService.getTransactionStatus(
          payout.onChainTxHash,
        );
        onChain = result;
      } catch (error) {
        this.logger.warn(
          `Horizon status query failed for payout ${payoutId}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    return {
      id: payout.id,
      status: payout.status,
      onChainTxHash: payout.onChainTxHash,
      confirmedAt: payout.confirmedAt,
      onChain,
    };
  }

  async processPayout(payoutId: number): Promise<{
    id: number;
    status: string;
    transactionId: string;
    externalTransactionId: string | null;
    onChainTxHash: string | null;
  }> {
    return this.payoutProcessingService.processPayout(payoutId);
  }

  async approvePayout(
    payoutId: number,
    adminUserId?: number,
    _note?: string,
  ): Promise<{ id: number; status: string; approvedAt: Date; approvedBy: number | null }> {
    const payout = await this.prisma.payout.findUnique({ where: { id: payoutId } });
    if (!payout) throw new NotFoundException('Payout not found');
    if (!this.payoutApprovalService.canApprove(payout.status)) {
      throw new BadRequestException(`Cannot approve payout in '${payout.status}' status`);
    }

    const now = new Date();
    const updated = await this.prisma.payout.update({
      where: { id: payoutId },
      data: {
        status: 'approved',
        approvedAt: now,
        approvedBy: adminUserId ?? null,
        reviewedAt: now,
      },
    });

    await this.prisma.earningsAuditLog.create({
      data: {
        userId: payout.userId,
        amount: payout.amount,
        actionType: 'payout_approved',
      },
    });

    this.logger.log(
      `Payout ${payoutId} approved by admin${adminUserId ? ` ${adminUserId}` : ''}`,
    );
    return { id: updated.id, status: updated.status, approvedAt: updated.approvedAt!, approvedBy: updated.approvedBy };
  }

  async rejectPayout(
    payoutId: number,
    reason?: string,
  ): Promise<{ id: number; status: string; rejectedAt: Date; rejectionReason: string | null }> {
    const payout = await this.prisma.payout.findUnique({ where: { id: payoutId } });
    if (!payout) throw new NotFoundException('Payout not found');
    if (!this.payoutApprovalService.canReject(payout.status)) {
      throw new BadRequestException(`Cannot reject payout in '${payout.status}' status`);
    }

    const now = new Date();
    const updated = await this.prisma.payout.update({
      where: { id: payoutId },
      data: { status: 'rejected', rejectedAt: now, reviewedAt: now, rejectionReason: reason ?? null },
    });

    await this.prisma.earningsAuditLog.create({
      data: {
        userId: payout.userId,
        amount: payout.amount,
        actionType: 'payout_rejected',
      },
    });

    this.logger.log(`Payout ${payoutId} rejected by admin. Reason: ${reason ?? 'none'}`);
    return {
      id: updated.id,
      status: updated.status,
      rejectedAt: updated.rejectedAt!,
      rejectionReason: updated.rejectionReason,
    };
  }

  async listPendingPayouts(): Promise<Array<{ id: number; userId: number; amount: number; currency: string; status: string; createdAt: Date }>> {
    return this.prisma.payout.findMany({
      where: { status: { in: ['pending_approval', 'approved'] } },
      orderBy: { createdAt: 'asc' },
      select: { id: true, userId: true, amount: true, currency: true, status: true, createdAt: true },
    });
  }

  async listPendingReviewPayouts(): Promise<Array<{ id: number; userId: number; amount: number; currency: string; status: string; createdAt: Date }>> {
    return this.prisma.payout.findMany({
      where: { status: 'pending_review' },
      orderBy: { createdAt: 'asc' },
      select: { id: true, userId: true, amount: true, currency: true, status: true, createdAt: true },
    });
  }

  async batchProcessPayouts(payoutIds: number[]): Promise<{
    processed: number;
    failed: number;
    results: Array<{ id: number; status: string; error?: string }>;
  }> {
    return this.payoutProcessingService.batchProcessPayouts(payoutIds);
  }

  async cancelPayout(userId: number, payoutId: number): Promise<{ id: number; status: string }> {
    const payout = await this.prisma.payout.findFirst({
      where: { id: payoutId, userId },
    });

    if (!payout) {
      throw new NotFoundException('Payout record not found');
    }

    if (!['pending', 'pending_review', 'pending_approval'].includes(payout.status)) {
      throw new BadRequestException(
        `Cannot cancel payout in '${payout.status}' status. Only pending payouts can be canceled.`
      );
    }

    const updated = await this.prisma.payout.update({
      where: { id: payoutId },
      data: { status: 'canceled' },
    });

    this.logger.log(`Payout ${payoutId} canceled by user ${userId}`);

    return {
      id: updated.id,
      status: updated.status,
    };
  }

  async pollPendingStellarPayouts(): Promise<void> {
    return this.payoutProcessingService.pollPendingStellarPayouts();
  }

  /**
   * Get payout receipt PDF for download
   */
  async getPayoutReceiptPdf(userId: number, payoutId: number): Promise<Buffer> {
    // Verify ownership and that payout exists
    const payout = await this.prisma.payout.findFirst({
      where: { id: payoutId, userId },
      include: {
        wallet: { select: { address: true } },
        user: { select: { email: true } },
      },
    });

    if (!payout) {
      throw new NotFoundException('Payout not found');
    }

    if (payout.status !== 'completed') {
      throw new BadRequestException(
        'Receipt is only available for completed payouts',
      );
    }

    // Verify receipt exists
    const receipt = await this.prisma.payoutReceipt.findUnique({
      where: { payoutId },
    });

    if (!receipt) {
      throw new NotFoundException('Receipt not found for this payout');
    }

    // Generate PDF on-demand
    return this.payoutReceiptService.getReceiptPdf(payoutId, {
      payoutId: payout.id,
      amount: payout.amount,
      currency: payout.currency,
      method: payout.method,
      feeAmount: payout.feeAmount ?? undefined,
      feePercentage: payout.feePercentage ?? undefined,
      finalAmount: payout.finalAmount ?? undefined,
      transactionId: payout.transactionId || '',
      onChainTxHash: payout.onChainTxHash,
      confirmedAt: payout.confirmedAt || new Date(),
      paidAt: payout.paidAt || new Date(),
      status: payout.status,
      recipientEmail: payout.user.email,
      walletAddress: payout.wallet?.address || '',
    });
  }

  /**
   * Get payout receipt metadata
   */
  async getReceiptMetadata(userId: number, payoutId: number) {
    // Verify ownership
    const payout = await this.prisma.payout.findFirst({
      where: { id: payoutId, userId },
    });

    if (!payout) {
      throw new NotFoundException('Payout not found');
    }

    return this.payoutReceiptService.getReceiptByPayoutId(payoutId);
  }
}
