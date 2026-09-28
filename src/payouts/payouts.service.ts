import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StellarService } from '../stellar/stellar.service';
import { PayoutReceiptService } from './payout-receipt.service';
import { EarningsService } from '../earnings/earnings.service';
import { FeeService } from './fee.service';
import { PayoutApprovalService } from './payout-approval.service';
import { ConfigService } from '../config/config.service';
import { PayoutLimitsService } from './payout-limits.service';
import { CurrencyService } from '../common/services/currency.service';
import { MailService } from '../auth/mail.service';
import { PaginatedResponseDto } from '../common/dtos/api-response.dto';
import { buildPaginationArgs } from '../prisma/query-helpers';

import {
  OPEN_PAYOUT_STATUSES,
  expandStatusFilter,
  normalizePayoutStatusFilter,
import {
  ADMIN_PENDING_PAYOUT_STATUSES,
  PAID_OUT_PAYOUT_STATUSES,
  PAYOUT_STATUSES,
} from './payouts.constants';
import { PayoutValidationService } from './payout-validation.service';
import { PayoutProcessingService } from './payout-processing.service';
import { StellarPayoutVerificationService } from './stellar-payout-verification.service';

/**
 * Entry point for payout operations. Owns payout creation and the
 * user/admin-driven status transitions (approve, reject, cancel); eligibility
 * rules live in PayoutValidationService and Stellar transaction execution in
 * PayoutProcessingService.
 */
@Injectable()
export class PayoutsService {
  private readonly logger = new Logger(PayoutsService.name);
  private readonly defaultPayoutCurrency =
    process.env.DEFAULT_PAYOUT_CURRENCY ?? 'USD';

  constructor(
    private prisma: PrismaService,
    private earningsService: EarningsService,
    private stellarService: StellarService,
    private payoutReceiptService: PayoutReceiptService,
    private feeService: FeeService,
    private payoutApprovalService: PayoutApprovalService,
    private readonly payoutValidationService: PayoutValidationService,
    private readonly payoutProcessingService: PayoutProcessingService,
    private readonly stellarPayoutVerification: StellarPayoutVerificationService,
    private readonly mailService: MailService,
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
  ) {}

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
    await this.payoutValidationService.ensureNoOpenPayout(userId);
    const wallet = await this.payoutValidationService.getActiveStellarWallet(userId);

    const currency = this.defaultPayoutCurrency;

    const payout = await this.prisma.$transaction(async (tx) => {
      const totalEarnings = await tx.earning.aggregate({
        where: { clip: { video: { userId } }, deletedAt: null },
        _sum: { amount: true },
      });

      const totalPaidOut = await tx.payout.aggregate({
        where: { userId, status: { in: [...PAID_OUT_PAYOUT_STATUSES] } },
        _sum: { amount: true },
      });

      const availableBalance =
        (totalEarnings._sum.amount ?? 0) - (totalPaidOut._sum.amount ?? 0);

      await this.assertMinimumPayout(availableBalance, currency);
      const payoutAmount = this.payoutLimitsService.resolvePayoutAmount(
        availableBalance,
        currency,
      );
      await this.payoutValidationService.assertMinimumPayout(availableBalance, currency);

      const fee = await this.feeService.calculateFee(payoutAmount, 'stellar');
      const status = this.payoutApprovalService.resolveInitialStatus(payoutAmount);

      return tx.payout.create({
        data: {
          userId,
          walletId: wallet.id,
          amount: payoutAmount,
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
      fee: payout.feeAmount,
      feeAmount: payout.feeAmount,
      netAmount: payout.finalAmount,
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
    method: 'fiat' | 'stellar',
  ): Promise<{
    id: number;
    amount: number;
    currency: string;
    method: string;
    status: string;
    createdAt: Date;
    feeAmount?: number;
    finalAmount?: number;
  }> {
    await this.payoutValidationService.ensureNoOpenPayout(userId);
    await this.payoutValidationService.assertMinimumPayout(amount, currency);
    this.payoutValidationService.assertPayoutLimits(amount, currency);

    const earningsSummary = await this.earningsService.getUserTotalEarnings(userId);
    this.payoutValidationService.assertSufficientBalance(
      amount,
      earningsSummary.availableBalance,
      currency,
    );

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
    if (method === 'stellar') {
      walletId = (await this.payoutValidationService.getActiveStellarWallet(userId)).id;
    } else if (method === 'fiat') {
      payoutMethodId = (await this.payoutValidationService.getDefaultPayoutMethod(userId)).id;
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
    return {
      id: payout.id,
      amount: payout.amount,
      currency: payout.currency,
      method: payout.method,
      status: payout.status,
      createdAt: payout.createdAt,
      fee: payout.feeAmount,
      feeAmount: payout.feeAmount,
      netAmount: payout.finalAmount,
      finalAmount: payout.finalAmount,
    };
  }

  async getPayouts(
    userId: number,
    status?: string,
    page = 1,
    limit = 20,
  ): Promise<PaginatedResponseDto<any>> {
    const filterStatus = this.parseStatusFilter(status);
    const { skip, take, page: normalizedPage, limit: normalizedLimit } =
      buildPaginationArgs(page, limit);

    const where = {
      userId,
      ...(filterStatus
        ? { status: { in: expandStatusFilter(filterStatus) } }
        : {}),
    };

    const payouts = await this.prisma.payout.findMany({
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

    return payouts.map((p) => ({
      ...p,
      fee: p.feeAmount,
      netAmount: p.finalAmount,
    }));
    const select = {
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
      approvedBy: true,
      rejectedAt: true,
      rejectionReason: true,
      createdAt: true,
      updatedAt: true,
    };

    const [items, total] = await Promise.all([
      this.prisma.payout.findMany({
        where,
        select,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.payout.count({ where }),
    ]);

    return new PaginatedResponseDto(items, total, normalizedPage, normalizedLimit);
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

    return {
      ...payout,
      fee: payout.feeAmount,
      netAmount: payout.finalAmount,
    };
  }

  private parseStatusFilter(status?: string): string | undefined {
    return normalizePayoutStatusFilter(status);
  }

  /**
   * Query Horizon, verify destination/amount, and update payout status (#982).
   * - 404 transaction-not-found when the hash is missing on Horizon
   * - 409 verification-conflict when destination/amount do not match
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
      destination?: string;
      transferredAmount?: number;
    };
  }> {
    const payout = await this.prisma.payout.findFirst({
      where: { id: payoutId, userId },
      select: {
        id: true,
        status: true,
        method: true,
        amount: true,
        finalAmount: true,
        onChainTxHash: true,
        confirmedAt: true,
        wallet: { select: { address: true } },
      },
    });

    if (!payout) {
      throw new NotFoundException('Payout record not found');
    }

    if (!payout.onChainTxHash) {
      throw new NotFoundException({
        statusCode: 404,
        error: 'Not Found',
        message: 'transaction-not-found',
        details: 'No on-chain transaction hash is stored for this payout',
      });
    }

    if (payout.method !== 'stellar') {
      return {
        id: payout.id,
        status: payout.status,
        onChainTxHash: payout.onChainTxHash,
        confirmedAt: payout.confirmedAt,
        onChain: { found: false },
      };
    }

    const expectedAmount = payout.finalAmount ?? payout.amount;
    const verification = await this.stellarPayoutVerification.verifyPayoutTransaction(
      payout.onChainTxHash,
      {
        expectedDestination: payout.wallet?.address,
        expectedAmount,
        throwOnNotFound: true,
        throwOnConflict: true,
      },
    );

    let status = payout.status;
    let confirmedAt = payout.confirmedAt;

    if (verification.outcome === 'confirmed') {
      confirmedAt = verification.confirmedAt ?? new Date();
      const updated = await this.prisma.payout.updateMany({
        where: {
          id: payoutId,
          status: { in: ['pending', 'processing', 'approved'] },
        },
        data: {
          status: 'completed',
          confirmedAt,
          paidAt: confirmedAt,
        },
      });
      if (updated.count > 0) {
        status = 'completed';
        await this.prisma.earningsAuditLog.create({
          data: {
            userId,
            amount: payout.amount,
            actionType: 'payout_verification_success',
          },
        });
      } else if (payout.status === 'completed') {
        status = 'completed';
      }
    } else if (verification.outcome === 'failed') {
      const updated = await this.prisma.payout.updateMany({
        where: {
          id: payoutId,
          status: { in: ['pending', 'processing', 'approved'] },
        },
        data: {
          status: 'failed',
          failureReason: 'On-chain transaction unsuccessful',
        },
      });
      if (updated.count > 0) {
        status = 'failed';
        await this.prisma.earningsAuditLog.create({
          data: {
            userId,
            amount: payout.amount,
            actionType: 'payout_verification_failed',
          },
        });
      }
    }

    return {
      id: payout.id,
      status,
      onChainTxHash: payout.onChainTxHash,
      confirmedAt,
      onChain: {
        found: verification.found,
        successful: verification.successful,
        confirmedAt: verification.confirmedAt,
        destination: verification.destination,
        transferredAmount: verification.transferredAmount,
      },
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
    if (!adminUserId) {
      throw new BadRequestException('Admin identity is required to approve payouts');
    }

    const payout = await this.prisma.payout.findUnique({
      where: { id: payoutId },
      include: { user: { select: { email: true } } },
    });
    if (!payout) throw new NotFoundException('Payout not found');
    this.payoutValidationService.assertCanApprove(payout.status);

    const now = new Date();
    const updated = await this.prisma.payout.update({
      where: { id: payoutId },
      data: {
        status: PAYOUT_STATUSES.APPROVED,
        approvedAt: now,
        approvedBy: adminUserId,
        reviewedAt: now,
      },
    });

    await this.prisma.earningsAuditLog.create({
      data: {
        userId: payout.userId,
        amount: payout.amount,
        actionType: `payout_approved:admin=${adminUserId}`,
      },
    });

    await this.notifyPayoutUser(
      payout.user.email,
      `Payout #${payoutId} approved`,
      `Your payout request for ${payout.amount} ${payout.currency} was approved and will be processed shortly.`,
    );

    this.logger.log(`Payout ${payoutId} approved by admin ${adminUserId}`);
    return {
      id: updated.id,
      status: updated.status,
      approvedAt: updated.approvedAt!,
      approvedBy: updated.approvedBy,
    };
  }

  async rejectPayout(
    payoutId: number,
    reason: string,
    adminUserId?: number,
  ): Promise<{ id: number; status: string; rejectedAt: Date; rejectionReason: string | null }> {
    if (!reason?.trim()) {
      throw new BadRequestException('Rejection reason is required');
    }
    if (!adminUserId) {
      throw new BadRequestException('Admin identity is required to reject payouts');
    }

    const payout = await this.prisma.payout.findUnique({
      where: { id: payoutId },
      include: { user: { select: { email: true } } },
    });
    if (!payout) throw new NotFoundException('Payout not found');
    this.payoutValidationService.assertCanReject(payout.status);

    const now = new Date();
    const updated = await this.prisma.payout.update({
      where: { id: payoutId },
      data: {
        status: 'rejected',
        rejectedAt: now,
        reviewedAt: now,
        rejectionReason: reason.trim(),
        approvedBy: adminUserId,
      },
      data: { status: PAYOUT_STATUSES.REJECTED, rejectedAt: now, reviewedAt: now, rejectionReason: reason ?? null },
    });

    await this.prisma.earningsAuditLog.create({
      data: {
        userId: payout.userId,
        amount: payout.amount,
        actionType: `payout_rejected:admin=${adminUserId}`,
      },
    });

    await this.notifyPayoutUser(
      payout.user.email,
      `Payout #${payoutId} rejected`,
      `Your payout request for ${payout.amount} ${payout.currency} was rejected. Reason: ${reason.trim()}`,
    );

    this.logger.log(
      `Payout ${payoutId} rejected by admin ${adminUserId}. Reason: ${reason.trim()}`,
    );
    return {
      id: updated.id,
      status: updated.status,
      rejectedAt: updated.rejectedAt!,
      rejectionReason: updated.rejectionReason,
    };
  }

  private async notifyPayoutUser(
    email: string | null | undefined,
    subject: string,
    text: string,
  ): Promise<void> {
    if (!email) {
      this.logger.warn(`Skipping payout notification — user has no email`);
      return;
    }
    try {
      await this.mailService.sendEmail({ to: email, subject, text, html: `<p>${text}</p>` });
    } catch (error) {
      this.logger.warn(
        `Failed to notify user ${email}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async listPendingPayouts(): Promise<Array<{ id: number; userId: number; amount: number; currency: string; status: string; createdAt: Date }>> {
    return this.prisma.payout.findMany({
      where: { status: { in: ['pending_approval', 'under_review', 'pending_review', 'approved'] } },
      where: { status: { in: [...ADMIN_PENDING_PAYOUT_STATUSES] } },
      orderBy: { createdAt: 'asc' },
      select: { id: true, userId: true, amount: true, currency: true, status: true, createdAt: true },
    });
  }

  async listPendingReviewPayouts(): Promise<Array<{ id: number; userId: number; amount: number; currency: string; status: string; createdAt: Date }>> {
    return this.prisma.payout.findMany({
      where: { status: { in: ['under_review', 'pending_review'] } },
      where: { status: PAYOUT_STATUSES.PENDING_REVIEW },
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

    if (
      !['pending', 'under_review', 'pending_review', 'pending_approval'].includes(
        payout.status,
      )
    ) {
      throw new BadRequestException(
        `Cannot cancel payout in '${payout.status}' status. Only pending payouts can be canceled.`,
      );
    }
    this.payoutValidationService.assertCanCancel(payout.status);

    const updated = await this.prisma.payout.update({
      where: { id: payoutId },
      data: { status: PAYOUT_STATUSES.CANCELED },
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
      throw new ConflictException(
        'Receipt is not yet available — payout is not completed',
    if (payout.status !== PAYOUT_STATUSES.COMPLETED) {
      throw new BadRequestException(
        'Receipt is only available for completed payouts',
      );
    }

    // Verify receipt exists
    const receipt = await this.prisma.payoutReceipt.findUnique({
      where: { payoutId },
    });

    if (!receipt) {
      throw new ConflictException(
        'Receipt is not yet available for this payout',
      );
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
