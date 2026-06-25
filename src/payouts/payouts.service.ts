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
import { FeeService } from './fee.service';
import { PayoutApprovalService } from './payout-approval.service';
import { ConfigService } from '../config/config.service';

const OPEN_PAYOUT_STATUSES = [
  'pending',
  'pending_approval',
  'approved',
  'processing',
] as const;

@Injectable()
export class PayoutsService {
  private readonly logger = new Logger(PayoutsService.name);
  private readonly defaultPayoutCurrency =
    process.env.DEFAULT_PAYOUT_CURRENCY ?? 'USD';
  private readonly payoutLimitsService: any; // temp fix since it was referenced but not injected

  constructor(
    private prisma: PrismaService,
    private earningsService: EarningsService,
    private stellarService: StellarService,
    private payoutReceiptService: PayoutReceiptService,
    private feeService: FeeService,
    private payoutApprovalService: PayoutApprovalService,
    private readonly config: ConfigService,
    @InjectQueue(PAYOUT_RETRY_QUEUE) private payoutRetryQueue: Queue,
  ) {}

  private assertMinimumPayout(amount: number): void {
    if (amount < this.config.minStellarPayout) {
      throw new BadRequestException(
        `Minimum payout amount is ${this.config.minStellarPayout} USD equivalent.`,
      );
    }
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
    const payout = await this.prisma.payout.findFirst({
      where: { id: payoutId, userId },
      include: {
        wallet: {
          select: { address: true },
        },
      },
    });

    if (!payout) {
      throw new NotFoundException('Payout record not found');
    }

    if (payout.status !== 'approved' && payout.status !== 'pending') {
      throw new BadRequestException(
        `Payout must be approved or pending before Stellar initiation (current status: ${payout.status})`,
      );
    }

    if (payout.method !== 'stellar') {
      throw new BadRequestException('Only Stellar payouts can be initiated here');
    }

    if (payout.amount !== amount) {
      throw new BadRequestException('Requested amount does not match payout amount');
    }

    this.assertMinimumPayout(amount);

    const existingPending = await this.prisma.payout.findFirst({
      where: {
        id: payoutId,
        userId,
        status: 'pending',
        transactionId: { not: null },
      },
    });

    if (existingPending) {
      throw new ConflictException('A Stellar payout transaction is already pending for this payout');
    }

    const platformAddress = this.getPlatformWalletAddress();
    if (!platformAddress) {
      throw new BadRequestException(
        'Platform Stellar wallet address is not configured',
      );
    }

    const platformAddressCheck = this.stellarService.validateAddress(platformAddress);
    if (!platformAddressCheck.valid) {
      throw new BadRequestException('Invalid platform Stellar wallet address');
    }

    const payoutWalletAddress = payout.wallet?.address;
    if (!payoutWalletAddress) {
      throw new BadRequestException('No wallet associated with this payout');
    }

    const destinationCheck = this.stellarService.validateAddress(payoutWalletAddress);
    if (!destinationCheck.valid) {
      throw new BadRequestException('Invalid destination Stellar address');
    }

    const platformBalance = await this.stellarService.getAccountBalance(platformAddress);
    if (platformBalance < amount) {
      throw new BadRequestException(
        `Insufficient platform balance. Available: ${platformBalance} XLM`,
      );
    }

    const platformSecret = process.env.STELLAR_PLATFORM_SECRET;
    if (!platformSecret) {
      throw new InternalServerErrorException(
        'STELLAR_PLATFORM_SECRET environment variable is not set',
      );
    }

    const sourceKeyPair = StellarSdk.Keypair.fromSecret(platformSecret);
    const server = new StellarSdk.Horizon.Server(this.stellarService.horizonUrl);
    const sourceAccount = await server.loadAccount(sourceKeyPair.publicKey());

    const transaction = new StellarSdk.TransactionBuilder(sourceAccount, {
      fee: StellarSdk.BASE_FEE,
      networkPassphrase: this.stellarService.networkPassphrase,
    })
      .addOperation(
        StellarSdk.Operation.payment({
          destination: payoutWalletAddress,
          asset: StellarSdk.Asset.native(),
          amount: amount.toString(),
        }),
      )
      .setTimeout(60)
      .build();

    transaction.sign(sourceKeyPair);

    const transactionId = transaction.hash().toString('hex');
    const stellarXdr = transaction.toXDR();

    const updated = await this.prisma.payout.update({
      where: { id: payoutId },
      data: {
        status: 'pending',
        transactionId,
        stellarXdr,
        externalTransactionId: transactionId,
      },
    });

    return {
      id: updated.id,
      status: updated.status,
      amount: updated.amount,
      transactionId,
      stellarXdr,
    };
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
      where: { userId, deletedAt: null },
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

      this.assertMinimumPayout(availableBalance);

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

  async requestPayoutWithDetails(
    userId: number,
    amount: number,
    currency: string,
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
    const existingPending = await this.prisma.payout.findFirst({
      where: { userId, status: { in: [...OPEN_PAYOUT_STATUSES] } },
    });

    if (existingPending) {
      throw new ConflictException(
        'A payout request is already pending for this user',
      );
    }

    this.assertMinimumPayout(amount);

    const totalEarnings = await this.prisma.earning.aggregate({
      where: { clip: { video: { userId } }, deletedAt: null },
      _sum: { amount: true },
    });

    const totalPaidOut = await this.prisma.payout.aggregate({
      where: { userId, status: { in: ['completed', 'processing'] } },
      _sum: { amount: true },
    });

    const availableBalance =
      (totalEarnings._sum.amount ?? 0) - (totalPaidOut._sum.amount ?? 0);

    if (amount > availableBalance) {
      throw new BadRequestException(
        `Insufficient balance. Available: ${availableBalance} ${currency}`,
      );
    }

    let walletId: number | null = null;
    let payoutMethodId: number | null = null;

    if (method === 'stellar') {
      const wallet = await this.prisma.wallet.findFirst({
        where: { userId, deletedAt: null },
      });

      if (!wallet) {
        throw new BadRequestException(
          'No active Stellar wallet found. Please connect a wallet first.',
        );
      }
      walletId = wallet.id;
    } else if (method === 'fiat') {
      const payoutMethod = await this.prisma.payoutMethod.findFirst({
        where: { userId, isDefault: true, deletedAt: null },
      });

      if (!payoutMethod) {
        throw new BadRequestException(
          'No default payout method found. Please add a payout method first.',
        );
      }
      payoutMethodId = payoutMethod.id;
    }

    const feeCalculation = await this.feeService.calculateFee(amount, method);
    const status = this.payoutApprovalService.resolveInitialStatus(amount);

    const payout = await this.prisma.payout.create({
      data: {
        userId,
        walletId,
        payoutMethodId,
        amount,
        currency,
        method,
        status,
        feeAmount: feeCalculation.feeAmount,
        feePercentage: feeCalculation.feePercentage,
        finalAmount: feeCalculation.finalAmount,
      },
    });

    this.logger.log(
      `Payout request created: ${payout.id} for user ${userId}, amount: ${amount} ${currency}`,
    );

    return {
      id: payout.id,
      amount: payout.amount,
      currency: payout.currency,
      method: payout.method,
      status: payout.status,
      createdAt: payout.createdAt,
      feeAmount: payout.feeAmount,
      finalAmount: payout.finalAmount,
    };
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
      orderBy: { createdAt: 'desc' },
    });
  }

  async getPayoutById(
    userId: number,
    payoutId: number,
  ): Promise<any> {
    const payout = await this.prisma.payout.findFirst({
      where: { id: payoutId, userId },
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

  async processPayout(payoutId: number): Promise<{
    id: number;
    status: string;
    transactionId: string;
    externalTransactionId: string | null;
    onChainTxHash: string | null;
  }> {
    // Performance: Use select to fetch only needed fields for payout processing (optimization #326)
    const payout = await this.prisma.payout.findUnique({
      where: { id: payoutId },
      select: {
        id: true,
        amount: true,
        currency: true,
        method: true,
        status: true,
        stellarXdr: true,
        retryCount: true,
        wallet: {
          select: {
            address: true,
          },
        },
        user: {
          select: {
            id: true,
            email: true,
          },
        },
      },
    });

    if (!payout) {
      throw new NotFoundException('Payout record not found');
    }

    if (payout.status === 'completed') {
      throw new BadRequestException(
        `Payout is already in ${payout.status} status`,
      );
    }

    if (payout.status !== 'approved') {
      throw new BadRequestException(
        `Payout must be approved before processing (current status: ${payout.status})`,
      );
    }

    if (!payout.wallet) {
      throw new BadRequestException('No wallet associated with this payout');
    }

    this.assertMinimumPayout(payout.amount);

    const platformSecret = process.env.STELLAR_PLATFORM_SECRET;
    if (!platformSecret) {
      throw new InternalServerErrorException(
        'STELLAR_PLATFORM_SECRET environment variable is not set',
      );
    }

    const sourceKeyPair = StellarSdk.Keypair.fromSecret(platformSecret);
    const server = new StellarSdk.Horizon.Server(
      this.stellarService.horizonUrl,
    );

    try {
      // Update attempt count and timestamp before trying to process
      await this.prisma.payout.update({
        where: { id: payoutId },
        data: {
          retryCount: payout.retryCount + 1,
          lastAttemptAt: new Date(),
          status: 'processing',
        },
      });

      const sourceAccount = await server.loadAccount(sourceKeyPair.publicKey());

      const transaction = new StellarSdk.TransactionBuilder(sourceAccount, {
        fee: StellarSdk.BASE_FEE,
        networkPassphrase: this.stellarService.networkPassphrase,
      })
        .addOperation(
          StellarSdk.Operation.payment({
            destination: payout.wallet.address,
            asset: StellarSdk.Asset.native(),
            amount: payout.amount.toString(),
          }),
        )
        .setTimeout(60)
        .build();

      transaction.sign(sourceKeyPair);

      const submitResult = await server.submitTransaction(transaction);

      await this.prisma.payout.update({
        where: { id: payoutId },
        data: {
          status: 'completed',
          transactionId: transaction.hash().toString('hex'),
          externalTransactionId: submitResult.hash,
          onChainTxHash: submitResult.hash,
          confirmedAt: new Date(),
        },
      });

      this.logger.log(
        `Payout ${payoutId} completed. Transaction hash: ${submitResult.hash}`,
      );

      void this.payoutReceiptService.generateAndSendReceipt({
        payoutId: payout.id,
        amount: payout.amount,
        currency: payout.currency,
        method: payout.method,
        transactionId: transaction.hash().toString('hex'),
        onChainTxHash: submitResult.hash,
        confirmedAt: new Date(),
        recipientEmail: payout.user.email,
        walletAddress: payout.wallet.address,
      });

      return {
        id: payout.id,
        status: 'completed',
        transactionId: transaction.hash().toString('hex'),
        externalTransactionId: submitResult.hash,
        onChainTxHash: submitResult.hash,
      };
    } catch (error) {
      this.logger.error(`Stellar payout failed for ${payoutId}:`, error);
      
      // Check if we should retry
      const newRetryCount = payout.retryCount + 1;
      let shouldRetry = newRetryCount < MAX_PAYOUT_RETRIES;
      
      await this.prisma.payout.update({
        where: { id: payoutId },
        data: {
          status: shouldRetry ? 'failed' : 'failed', // keep failed status either way
          retryCount: newRetryCount,
          lastAttemptAt: new Date(),
        },
      });
      
      if (shouldRetry) {
        // Calculate exponential backoff delay (in milliseconds)
        const delay = Math.pow(PAYOUT_RETRY_BACKOFF_BASE, newRetryCount) * 1000;
        
        this.logger.log(
          `Scheduling retry ${newRetryCount} for payout ${payoutId} in ${delay}ms`,
        );
        
        await this.payoutRetryQueue.add(
          'retry-payout',
          { payoutId },
          {
            delay,
            attempts: MAX_PAYOUT_RETRIES - newRetryCount,
          },
        );
      } else {
        this.logger.warn(
          `Payout ${payoutId} has reached max retries (${MAX_PAYOUT_RETRIES}) and will not be retried`,
        );
      }
      
      throw new InternalServerErrorException(
        'Failed to process Stellar payout',
      );
    }
  }

  async approvePayout(payoutId: number): Promise<{ id: number; status: string; approvedAt: Date }> {
    const payout = await this.prisma.payout.findUnique({ where: { id: payoutId } });
    if (!payout) throw new NotFoundException('Payout not found');
    if (!['pending', 'pending_approval'].includes(payout.status)) {
      throw new BadRequestException(`Cannot approve payout in '${payout.status}' status`);
    }

    const updated = await this.prisma.payout.update({
      where: { id: payoutId },
      data: { status: 'approved', approvedAt: new Date() },
    });

    this.logger.log(`Payout ${payoutId} approved by admin`);
    return { id: updated.id, status: updated.status, approvedAt: updated.approvedAt! };
  }

  async rejectPayout(
    payoutId: number,
    reason?: string,
  ): Promise<{ id: number; status: string; rejectedAt: Date; rejectionReason: string | null }> {
    const payout = await this.prisma.payout.findUnique({ where: { id: payoutId } });
    if (!payout) throw new NotFoundException('Payout not found');
    if (!['pending', 'pending_approval', 'approved'].includes(payout.status)) {
      throw new BadRequestException(`Cannot reject payout in '${payout.status}' status`);
    }

    const updated = await this.prisma.payout.update({
      where: { id: payoutId },
      data: { status: 'rejected', rejectedAt: new Date(), rejectionReason: reason ?? null },
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

  async batchProcessPayouts(payoutIds: number[]): Promise<{
    processed: number;
    failed: number;
    results: Array<{ id: number; status: string; error?: string }>;
  }> {
    const results: Array<{ id: number; status: string; error?: string }> = [];
    let processed = 0;
    let failed = 0;

    for (const payoutId of payoutIds) {
      try {
        await this.prisma.$transaction(async (tx) => {
          const payout = await tx.payout.findUnique({
            where: { id: payoutId },
            include: { wallet: true, user: true },
          });

          if (!payout) {
            throw new NotFoundException('Payout record not found');
          }

          if (payout.status !== 'approved') {
            throw new BadRequestException(
              `Payout must be approved before processing (current status: ${payout.status})`,
            );
          }

          if (!payout.wallet) {
            throw new BadRequestException(
              'No wallet associated with this payout',
            );
          }

          this.assertMinimumPayout(payout.amount);

          const platformSecret = process.env.STELLAR_PLATFORM_SECRET;
          if (!platformSecret) {
            throw new InternalServerErrorException(
              'STELLAR_PLATFORM_SECRET environment variable is not set',
            );
          }

          const sourceKeyPair = StellarSdk.Keypair.fromSecret(platformSecret);
          const server = new StellarSdk.Horizon.Server(
            this.stellarService.horizonUrl,
          );

          const sourceAccount = await server.loadAccount(
            sourceKeyPair.publicKey(),
          );

          const transaction = new StellarSdk.TransactionBuilder(sourceAccount, {
            fee: StellarSdk.BASE_FEE,
            networkPassphrase: this.stellarService.networkPassphrase,
          })
            .addOperation(
              StellarSdk.Operation.payment({
                destination: payout.wallet.address,
                asset: StellarSdk.Asset.native(),
                amount: payout.amount.toString(),
              }),
            )
            .setTimeout(60)
            .build();

          transaction.sign(sourceKeyPair);

          const submitResult = await server.submitTransaction(transaction);

          await tx.payout.update({
            where: { id: payoutId },
            data: {
              status: 'completed',
              transactionId: transaction.hash().toString('hex'),
              onChainTxHash: submitResult.hash,
              confirmedAt: new Date(),
            },
          });

          this.logger.log(
            `Payout ${payoutId} completed in batch. Transaction hash: ${submitResult.hash}`,
          );

          void this.payoutReceiptService.generateAndSendReceipt({
            payoutId: payout.id,
            amount: payout.amount,
            currency: payout.currency,
            method: payout.method,
            transactionId: transaction.hash().toString('hex'),
            onChainTxHash: submitResult.hash,
            confirmedAt: new Date(),
            recipientEmail: payout.user.email,
            walletAddress: payout.wallet.address,
          });
        });

        results.push({ id: payoutId, status: 'completed' });
        processed++;
      } catch (error) {
        this.logger.error(`Batch payout failed for ${payoutId}:`, error);
        results.push({
          id: payoutId,
          status: 'failed',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        failed++;
      }
    }

    return { processed, failed, results };
  }

  async cancelPayout(userId: number, payoutId: number): Promise<{ id: number; status: string }> {
    const payout = await this.prisma.payout.findFirst({
      where: { id: payoutId, userId },
    });

    if (!payout) {
      throw new NotFoundException('Payout record not found');
    }

    if (!['pending', 'pending_approval'].includes(payout.status)) {
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
}
