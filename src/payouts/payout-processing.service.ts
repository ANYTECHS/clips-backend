import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import * as StellarSdk from '@stellar/stellar-sdk';
import { PrismaService } from '../prisma/prisma.service';
import { StellarService } from '../stellar/stellar.service';
import { PayoutReceiptService } from './payout-receipt.service';
import { PAYOUT_RETRY_QUEUE } from './payout-retry.queue';
import { PayoutRetryStrategyService } from './payout-retry-strategy.service';
import { STELLAR_CONFIRMATION_MAX_POLLS } from './stellar-confirmation.queue';
import { PayoutValidationService } from './payout-validation.service';
import { MAX_BULK_PAYOUT_BATCH_SIZE } from './payouts.constants';
import { StellarPayoutVerificationService } from './stellar-payout-verification.service';

import {
  PAYOUT_STATUSES,
  STELLAR_INITIABLE_PAYOUT_STATUSES,
  UNCONFIRMED_STELLAR_PAYOUT_STATUSES,
} from './payouts.constants';

/**
 * Executes payouts against the Stellar network: builds, submits and verifies
 * transactions, schedules retries and polls Horizon for confirmation. All
 * eligibility rules are delegated to PayoutValidationService.
 */
@Injectable()
export class PayoutProcessingService {
  private readonly logger = new Logger(PayoutProcessingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stellarService: StellarService,
    private readonly payoutReceiptService: PayoutReceiptService,
    private readonly payoutValidationService: PayoutValidationService,
    private readonly retryStrategy: PayoutRetryStrategyService,
    private readonly stellarPayoutVerification: StellarPayoutVerificationService,
    @InjectQueue(PAYOUT_RETRY_QUEUE) private readonly payoutRetryQueue: Queue,
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
    const payout = await this.prisma.payout.findFirst({
      where: { id: payoutId, userId, deletedAt: null },
      include: { wallet: { select: { address: true } } },
    });

    if (!payout) {
      throw new NotFoundException('Payout record not found');
    }

    await this.payoutValidationService.assertStellarInitiable(payout, amount);
    const platformAddress = this.payoutValidationService.getPlatformWalletAddress();
    const payoutWalletAddress = this.payoutValidationService.assertValidDestination(
      payout.wallet?.address,
    );

    const platformBalance = await this.stellarService.getAccountBalance(platformAddress);
    this.payoutValidationService.assertSufficientPlatformBalance(platformBalance, amount);

    // Build an *unsigned* payment transaction for the platform (or ops) to sign later.
    const server = new StellarSdk.Horizon.Server(this.stellarService.horizonUrl);
    const sourceAccount = await server.loadAccount(platformAddress);
    const transaction = this.buildPaymentTransaction(
      sourceAccount,
      payoutWalletAddress,
      amount,
    );

    const transactionId = transaction.hash().toString('hex');
    const stellarXdr = transaction.toXDR();

    const prepared = await this.prisma.payout.updateMany({
      where: {
        id: payoutId,
        userId,
        deletedAt: null,
        status: { in: [...STELLAR_INITIABLE_PAYOUT_STATUSES] },
        transactionId: null,
        stellarXdr: null,
      },
      data: {
        status: PAYOUT_STATUSES.PENDING,
        transactionId,
        stellarXdr,
        lastAttemptAt: new Date(),
      },
    });

    if (prepared.count !== 1) {
      throw new ConflictException(
        'A Stellar payout transaction is already pending for this payout',
      );
    }

    return {
      id: payout.id,
      status: PAYOUT_STATUSES.PENDING,
      amount: payout.amount,
      transactionId,
      stellarXdr,
    };
  }

  async processPayout(payoutId: number): Promise<{
    id: number;
    status: string;
    transactionId: string;
    externalTransactionId: string | null;
    onChainTxHash: string | null;
  }> {
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
        wallet: { select: { address: true } },
        user: { select: { id: true, email: true } },
      },
    });

    if (!payout) {
      throw new NotFoundException('Payout record not found');
    }

    this.payoutValidationService.assertNotCompleted(payout.status);
    const { wallet } = await this.payoutValidationService.assertProcessable(payout);

    const sourceKeyPair = this.getPlatformKeypair();
    const server = new StellarSdk.Horizon.Server(this.stellarService.horizonUrl);
    let submittedTxHash: string | undefined;
    let internalTransactionId: string | undefined;
    let trackingPersisted = false;
    let onChainFailure = false;

    try {
      await this.prisma.payout.update({
        where: { id: payoutId },
        data: {
          retryCount: payout.retryCount + 1,
          lastAttemptAt: new Date(),
          status: PAYOUT_STATUSES.PROCESSING,
        },
      });

      const sourceAccount = await server.loadAccount(sourceKeyPair.publicKey());
      const transaction = this.buildPaymentTransaction(
        sourceAccount,
        wallet.address,
        payout.amount,
      );

      transaction.sign(sourceKeyPair);
      internalTransactionId = transaction.hash().toString('hex');

      const submitResult = await server.submitTransaction(transaction);
      const txHash = submitResult.hash;
      submittedTxHash = txHash;

      await this.prisma.payout.update({
        where: { id: payoutId },
        data: {
          status: PAYOUT_STATUSES.PROCESSING,
          transactionId: internalTransactionId,
          externalTransactionId: txHash,
          onChainTxHash: txHash,
        },
      });
      trackingPersisted = true;

      this.logger.log(`Verifying transaction ${txHash} for payout ${payoutId}`);
      const verification = await this.verifyTransaction(
        txHash,
        payout.wallet.address,
        payout.finalAmount ?? payout.amount,
      );

      if (!verification.found) {
        throw new Error(`Transaction ${txHash} is not yet available on Horizon`);
      }

      if (!verification.successful) {
        onChainFailure = true;
        await this.prisma.earningsAuditLog.create({
          data: {
            userId: payout.user.id,
            amount: payout.amount,
            actionType: 'payout_verification_failed',
          },
        });
        throw new Error(`Transaction verification failed for hash ${txHash}`);
      }

      await this.prisma.earningsAuditLog.create({
        data: {
          userId: payout.user.id,
          amount: payout.amount,
          actionType: 'payout_verification_success',
        },
      });

      const confirmedTime = verification.confirmedAt || new Date();
      const completePayoutData = await this.prisma.payout.update({
        where: { id: payoutId },
        data: {
          status: PAYOUT_STATUSES.COMPLETED,
          transactionId: internalTransactionId,
          externalTransactionId: txHash,
          onChainTxHash: txHash,
          confirmedAt: confirmedTime,
          paidAt: confirmedTime,
          failureReason: null,
        },
      });

      this.logger.log(`Payout ${payoutId} completed. Transaction hash: ${txHash}`);

      void this.payoutReceiptService.generateAndSendReceipt({
        payoutId: completePayoutData.id,
        amount: completePayoutData.amount,
        currency: completePayoutData.currency,
        method: completePayoutData.method,
        feeAmount: completePayoutData.feeAmount ?? undefined,
        feePercentage: completePayoutData.feePercentage ?? undefined,
        finalAmount: completePayoutData.finalAmount ?? undefined,
        transactionId: internalTransactionId,
        onChainTxHash: txHash,
        confirmedAt: confirmedTime,
        paidAt: confirmedTime,
        status: PAYOUT_STATUSES.COMPLETED,
        recipientEmail: payout.user.email,
        walletAddress: wallet.address,
      });

      return {
        id: payout.id,
        status: PAYOUT_STATUSES.COMPLETED,
        transactionId: internalTransactionId,
        externalTransactionId: txHash,
        onChainTxHash: txHash,
      };
    } catch (error) {
      this.logger.error(`Stellar payout failed for ${payoutId}:`, error);

      if (submittedTxHash && internalTransactionId && !onChainFailure) {
        if (!trackingPersisted) {
          await this.prisma.payout.update({
            where: { id: payoutId },
            data: {
              status: PAYOUT_STATUSES.PROCESSING,
              transactionId: internalTransactionId,
              externalTransactionId: submittedTxHash,
              onChainTxHash: submittedTxHash,
            },
          });
        }

        this.logger.warn(
          `Payout ${payoutId} was submitted to Stellar and remains processing until Horizon confirms it (tx: ${submittedTxHash})`,
        );
        return {
          id: payoutId,
          status: PAYOUT_STATUSES.PROCESSING,
          transactionId: internalTransactionId,
          externalTransactionId: submittedTxHash,
          onChainTxHash: submittedTxHash,
        };
      }

      const newRetryCount = payout.retryCount + 1;
      const failureReason = error instanceof Error ? error.message : String(error);
      const shouldRetry = this.retryStrategy.shouldRetry(newRetryCount + 1);
      const nextRetryAt = shouldRetry
        ? this.retryStrategy.getNextRetryTime(newRetryCount + 1)
        : null;

      await this.prisma.payout.update({
        where: { id: payoutId },
        data: {
          status: shouldRetry ? 'pending_retry' : 'failed',
          status: PAYOUT_STATUSES.FAILED,
          retryCount: newRetryCount,
          lastAttemptAt: new Date(),
          failureReason: failureReason.slice(0, 1000),
          nextRetryAt,
        },
      });

      if (shouldRetry && nextRetryAt) {
        const delayMs = Math.max(
          0,
          nextRetryAt.getTime() - Date.now(),
        );
        this.logger.log(
          `Scheduling retry ${newRetryCount + 1} for payout ${payoutId} in ${delayMs}ms (nextRetryAt=${nextRetryAt.toISOString()})`,
        );

        await this.payoutRetryQueue.add(
          'retry-payout',
          { payoutId },
          {
            delay: delayMs,
            attempts: this.retryStrategy.getMaxRetries(),
            backoff: { type: 'exponential', delay: 60000 },
          },
        );
      } else {
        this.logger.warn(
          `Payout ${payoutId} has reached max retries (${this.retryStrategy.getMaxRetries()}) and will not be retried`,
        );
      }

      throw new InternalServerErrorException('Failed to process Stellar payout');
    }
  }

  /**
   * Manual retry for failed crypto transfers.
   * Allows POST /payouts/:id/retry for failed/pending_retry payouts.
   */
  async retryPayout(payoutId: number, userId?: number) {
    const payout = await this.prisma.payout.findFirst({
      where: userId ? { id: payoutId, userId } : { id: payoutId },
      select: { id: true, status: true, retryCount: true },
    });
    if (!payout) {
      throw new NotFoundException('Payout record not found');
    }
    if (!['failed', 'pending_retry'].includes(payout.status)) {
      throw new BadRequestException(
        `Only failed payouts can be retried (current status: ${payout.status})`,
      );
    }
    if (!this.retryStrategy.shouldRetry(payout.retryCount + 1)) {
      throw new BadRequestException(
        `Max retries (${this.retryStrategy.getMaxRetries()}) exceeded`,
      );
    }
    const nextRetryAt = this.retryStrategy.getNextRetryTime(
      payout.retryCount + 1,
    );
    await this.prisma.payout.update({
      where: { id: payoutId },
      data: { status: 'pending_retry', nextRetryAt, failureReason: null },
    });
    await this.payoutRetryQueue.add(
      'retry-payout',
      { payoutId },
      {
        delay: Math.max(0, nextRetryAt.getTime() - Date.now()),
        attempts: this.retryStrategy.getMaxRetries(),
      },
    );
    return { id: payoutId, status: 'pending_retry', nextRetryAt };
  }

  async batchProcessPayouts(payoutIds: number[]): Promise<{
    processed: number; failed: number; results: Array<{ id: number; status: string; error?: string }>;
  }> {
    if (!Array.isArray(payoutIds) || payoutIds.length === 0) {
      throw new BadRequestException('At least one payout ID is required');
    }

    if (payoutIds.length > MAX_BULK_PAYOUT_BATCH_SIZE) {
      throw new BadRequestException(
        `Maximum batch size is ${MAX_BULK_PAYOUT_BATCH_SIZE} payout IDs`,
      );
    }

    const uniqueIds = [...new Set(payoutIds)];
    const results: Array<{ id: number; status: string; error?: string }> = [];
    let processed = 0;
    let failed = 0;

    this.logger.log(
      `Bulk payout processing started for ${uniqueIds.length} payout(s)`,
    );

    for (const payoutId of uniqueIds) {
      let submittedTxHash: string | undefined;
      let internalTransactionId: string | undefined;
      try {
        const payoutResult = await this.prisma.$transaction(async (tx) => {
          const payout = await tx.payout.findUnique({
            where: { id: payoutId },
            include: { wallet: true, user: true },
          });

          if (!payout) {
            throw new NotFoundException('Payout record not found');
          }

          if (payout.deletedAt !== null) {
            throw new BadRequestException('Payout has been deleted and is not eligible');
          }

          if (payout.status !== 'approved') {
            throw new BadRequestException(
              `Payout must be approved before processing (current status: ${payout.status})`,
            );
          }

          if (!payout.wallet) {
            throw new BadRequestException('No wallet associated with this payout');
          }
          const { wallet } = await this.payoutValidationService.assertProcessable(payout);

          const sourceKeyPair = this.getPlatformKeypair();
          const server = new StellarSdk.Horizon.Server(this.stellarService.horizonUrl);
          const sourceAccount = await server.loadAccount(sourceKeyPair.publicKey());
          const transaction = this.buildPaymentTransaction(
            sourceAccount,
            wallet.address,
            payout.amount,
          );

          transaction.sign(sourceKeyPair);
          internalTransactionId = transaction.hash().toString('hex');

          const submitResult = await server.submitTransaction(transaction);
          const txHash = submitResult.hash;
          submittedTxHash = txHash;

          await tx.payout.update({
            where: { id: payoutId },
            data: {
              status: PAYOUT_STATUSES.PROCESSING,
              transactionId: internalTransactionId,
              externalTransactionId: txHash,
              onChainTxHash: txHash,
            },
          });

          this.logger.log(`Verifying transaction ${txHash} for batch payout ${payoutId}`);
          const verification = await this.verifyTransaction(
            txHash,
            payout.wallet.address,
            payout.finalAmount ?? payout.amount,
          );

          if (!verification.found) {
            return { status: PAYOUT_STATUSES.PROCESSING };
          }

          if (!verification.successful) {
            await tx.earningsAuditLog.create({
              data: {
                userId: payout.user.id,
                amount: payout.amount,
                actionType: 'payout_verification_failed',
              },
            });
            const failureReason = `Transaction verification failed for hash ${txHash}`;
            await tx.payout.update({
              where: { id: payoutId },
              data: {
                status: PAYOUT_STATUSES.FAILED,
                failureReason,
              },
            });
            return { status: PAYOUT_STATUSES.FAILED, error: failureReason };
          }

          await tx.earningsAuditLog.create({
            data: {
              userId: payout.user.id,
              amount: payout.amount,
              actionType: 'payout_verification_success',
            },
          });

          const confirmedTime = verification.confirmedAt || new Date();

          await tx.payout.update({
            where: { id: payoutId },
            data: {
              status: PAYOUT_STATUSES.COMPLETED,
              transactionId: internalTransactionId,
              externalTransactionId: txHash,
              onChainTxHash: txHash,
              confirmedAt: confirmedTime,
              paidAt: confirmedTime,
              failureReason: null,
            },
          });

          this.logger.log(`Payout ${payoutId} completed in batch. Transaction hash: ${txHash}`);

          void this.payoutReceiptService.generateAndSendReceipt({
            payoutId: payout.id,
            amount: payout.amount,
            currency: payout.currency,
            method: payout.method,
            feeAmount: payout.feeAmount ?? undefined,
            feePercentage: payout.feePercentage ?? undefined,
            finalAmount: payout.finalAmount ?? undefined,
            transactionId: internalTransactionId,
            onChainTxHash: txHash,
            confirmedAt: confirmedTime,
            paidAt: confirmedTime,
            status: PAYOUT_STATUSES.COMPLETED,
            recipientEmail: payout.user.email,
            walletAddress: wallet.address,
          });

          return { status: PAYOUT_STATUSES.COMPLETED };
        });

        results.push({ id: payoutId, ...payoutResult });
        if (payoutResult.status === PAYOUT_STATUSES.FAILED) {
          failed++;
        } else {
          processed++;
        }
      } catch (error) {
        this.logger.error(`Batch payout failed for ${payoutId}:`, error);
        if (submittedTxHash && internalTransactionId) {
          await this.prisma.payout.update({
            where: { id: payoutId },
            data: {
              status: PAYOUT_STATUSES.PROCESSING,
              transactionId: internalTransactionId,
              externalTransactionId: submittedTxHash,
              onChainTxHash: submittedTxHash,
            },
          });
          results.push({
            id: payoutId,
            status: PAYOUT_STATUSES.PROCESSING,
          });
          processed++;
          continue;
        }

        results.push({
          id: payoutId,
          status: PAYOUT_STATUSES.FAILED,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        failed++;
      }
    }

    this.logger.log(
      `Bulk payout processing finished: processed=${processed}, failed=${failed}`,
    );

    return { processed, failed, results };
  }

  /**
   * Poll Horizon for every Stellar payout still awaiting on-chain
   * confirmation. A failure on one payout is logged and does not stop the
   * rest of the batch.
   */
  async pollPendingStellarPayouts(): Promise<void> {
    const pending = await this.prisma.payout.findMany({
      where: {
        method: 'stellar',
        status: { in: [...UNCONFIRMED_STELLAR_PAYOUT_STATUSES] },
        onChainTxHash: { not: null },
        confirmedAt: null,
      },
      select: {
        id: true,
        onChainTxHash: true,
        confirmationPollCount: true,
        userId: true,
        amount: true,
        finalAmount: true,
        currency: true,
        method: true,
        feeAmount: true,
        feePercentage: true,
        transactionId: true,
        user: { select: { email: true } },
        wallet: { select: { address: true } },
      },
    });

    if (pending.length === 0) return;

    this.logger.log(`Polling ${pending.length} pending Stellar payout(s) for on-chain confirmation`);

    for (const payout of pending) {
      try {
        await this.confirmOneStellarPayout(
          payout.id,
          payout.onChainTxHash!,
          payout.confirmationPollCount,
          payout.userId,
          payout.amount,
          payout.wallet?.address,
          payout.finalAmount ?? payout.amount,
          {
            currency: payout.currency,
            method: payout.method,
            feeAmount: payout.feeAmount,
            feePercentage: payout.feePercentage,
            transactionId: payout.transactionId,
            recipientEmail: payout.user?.email ?? '',
            walletAddress: payout.wallet?.address,
          },
        );
      } catch (error) {
        this.logger.error(
          `Confirmation poll failed for payout ${payout.id}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  private async confirmOneStellarPayout(
    payoutId: number,
    txHash: string,
    currentPollCount: number,
    userId: number,
    amount: number,
    expectedDestination?: string,
    expectedAmount?: number,
    receiptData?: {
      currency: string;
      method: string;
      feeAmount: number | null;
      feePercentage: number | null;
      transactionId: string | null;
      recipientEmail: string;
      walletAddress?: string;
    },
  ): Promise<void> {
    const result = await this.stellarPayoutVerification.verifyPayoutTransaction(
      txHash,
      {
        expectedDestination,
        expectedAmount,
        throwOnNotFound: false,
        throwOnConflict: false,
      },
    );
    if (result.outcome === 'unavailable') {
      this.logger.warn(
        `Horizon confirmation check unavailable for payout ${payoutId} (tx: ${txHash}); will retry on the next poll`,
      );
      return;
    }

    const checkedAt = new Date();
    const newPollCount = currentPollCount + 1;

    if (result.outcome !== 'unknown') {
      if (result.outcome === 'confirmed') {
        const confirmedAt = result.confirmedAt ?? checkedAt;
        const updated = await this.prisma.payout.updateMany({
          where: {
            id: payoutId,
            status: { in: [...UNCONFIRMED_STELLAR_PAYOUT_STATUSES] },
            confirmedAt: null,
          },
          data: {
            status: PAYOUT_STATUSES.COMPLETED,
            confirmedAt,
            paidAt: confirmedAt,
            confirmationPollCount: newPollCount,
            lastConfirmationCheckAt: checkedAt,
            failureReason: null,
          },
        });

        if (updated.count > 0) {
          this.logger.log(`Payout ${payoutId} confirmed on-chain (tx: ${txHash})`);
          await this.prisma.earningsAuditLog.create({
            data: {
              userId,
              amount,
              actionType: 'payout_verification_success',
            },
          });

          if (receiptData?.walletAddress && receiptData.recipientEmail) {
            void this.payoutReceiptService.generateAndSendReceipt({
              payoutId,
              amount,
              currency: receiptData.currency,
              method: receiptData.method,
              feeAmount: receiptData.feeAmount ?? undefined,
              feePercentage: receiptData.feePercentage ?? undefined,
              finalAmount: expectedAmount,
              transactionId: receiptData.transactionId ?? txHash,
              onChainTxHash: txHash,
              confirmedAt,
              paidAt: confirmedAt,
              status: PAYOUT_STATUSES.COMPLETED,
              recipientEmail: receiptData.recipientEmail,
              walletAddress: receiptData.walletAddress,
            });
          } else {
            this.logger.warn(
              `Receipt not generated for payout ${payoutId}: recipient details are unavailable`,
            );
          }
        }
      } else {
        const updated = await this.prisma.payout.updateMany({
          where: {
            id: payoutId,
            status: { in: [...UNCONFIRMED_STELLAR_PAYOUT_STATUSES] },
            confirmedAt: null,
          },
          data: {
            status: PAYOUT_STATUSES.FAILED,
            failureReason:
              result.outcome === 'conflict'
                ? result.conflictReason ?? 'Stellar payout verification conflict'
                : 'Stellar transaction failed on Horizon',
            confirmationPollCount: newPollCount,
            lastConfirmationCheckAt: checkedAt,
          },
        });

        if (updated.count > 0) {
          this.logger.warn(`Payout ${payoutId} rejected on-chain (tx: ${txHash})`);
          await this.prisma.earningsAuditLog.create({
            data: {
              userId,
              amount,
              actionType: 'payout_verification_failed',
            },
          });
        }
      }
      return;
    }

    if (newPollCount >= STELLAR_CONFIRMATION_MAX_POLLS) {
      const updated = await this.prisma.payout.updateMany({
        where: {
          id: payoutId,
          status: { in: [...UNCONFIRMED_STELLAR_PAYOUT_STATUSES] },
          confirmedAt: null,
        },
        data: {
          status: PAYOUT_STATUSES.FAILED,
          failureReason: `Stellar transaction was not found after ${newPollCount} confirmation checks`,
          confirmationPollCount: newPollCount,
          lastConfirmationCheckAt: checkedAt,
        },
      });

      if (updated.count > 0) {
        this.logger.warn(
          `Payout ${payoutId} marked failed after ${newPollCount} unconfirmed polls (tx: ${txHash})`,
        );
        await this.prisma.earningsAuditLog.create({
          data: {
            userId,
            amount,
            actionType: 'payout_verification_failed',
          },
        });
      }
    } else {
      await this.prisma.payout.updateMany({
        where: {
          id: payoutId,
          status: { in: [...UNCONFIRMED_STELLAR_PAYOUT_STATUSES] },
          confirmedAt: null,
        },
        data: {
          confirmationPollCount: newPollCount,
          lastConfirmationCheckAt: checkedAt,
        },
      });
    }
  }

  private getPlatformKeypair(): StellarSdk.Keypair {
    const platformSecret = process.env.STELLAR_PLATFORM_SECRET;
    if (!platformSecret) {
      throw new InternalServerErrorException(
        'STELLAR_PLATFORM_SECRET environment variable is not set',
      );
    }

    return StellarSdk.Keypair.fromSecret(platformSecret);
  }

  private buildPaymentTransaction(
    sourceAccount: ConstructorParameters<typeof StellarSdk.TransactionBuilder>[0],
    destination: string,
    amount: number,
  ): StellarSdk.Transaction {
    return new StellarSdk.TransactionBuilder(sourceAccount, {
      fee: StellarSdk.BASE_FEE,
      networkPassphrase: this.stellarService.networkPassphrase,
    })
      .addOperation(
        StellarSdk.Operation.payment({
          destination,
          asset: StellarSdk.Asset.native(),
          amount: amount.toString(),
        }),
      )
      .setTimeout(60)
      .build();
  }

  private async verifyTransaction(
    txHash: string,
    expectedDestination?: string,
    expectedAmount?: number,
  ): Promise<{
    successful: boolean;
    found: boolean;
    confirmedAt?: Date;
  }> {
    const maxPolls = 3;
    const pollIntervalMs = 1000;

    for (let attempt = 1; attempt <= maxPolls; attempt++) {
      try {
        const result = await this.stellarPayoutVerification.verifyPayoutTransaction(
          txHash,
          {
            expectedDestination,
            expectedAmount,
            throwOnNotFound: false,
            throwOnConflict: false,
          },
        );

        if (result.found) {
          return {
            successful: result.outcome === 'confirmed',
            found: result.found,
            confirmedAt: result.confirmedAt,
          };
        }
      } catch (err) {
        this.logger.warn(
          `Transaction status check attempt ${attempt} failed for ${txHash}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      if (attempt < maxPolls) {
        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
      }
    }

    return { successful: false, found: false };
  }
}
