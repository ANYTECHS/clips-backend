import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import * as StellarSdk from '@stellar/stellar-sdk';
import { PrismaService } from '../prisma/prisma.service';
import { StellarService } from '../stellar/stellar.service';
import { PayoutReceiptService } from './payout-receipt.service';
import { PAYOUT_RETRY_QUEUE, MAX_PAYOUT_RETRIES, PAYOUT_RETRY_BACKOFF_BASE } from './payout-retry.queue';
import { STELLAR_CONFIRMATION_MAX_POLLS } from './stellar-confirmation.queue';
import { PayoutValidationService } from './payout-validation.service';

@Injectable()
export class PayoutProcessingService {
  private readonly logger = new Logger(PayoutProcessingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stellarService: StellarService,
    private readonly payoutReceiptService: PayoutReceiptService,
    private readonly payoutValidationService: PayoutValidationService,
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
      where: { id: payoutId, userId },
      include: { wallet: { select: { address: true } } },
    });

    if (!payout) {
      throw new NotFoundException('Payout record not found');
    }

    if (payout.status !== 'approved' && payout.status !== 'pending' && payout.status !== 'pending_review') {
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

    await this.payoutValidationService.assertMinimumPayout(amount, payout.currency);

    const existingPending = await this.prisma.payout.findFirst({
      where: {
        id: payoutId,
        userId,
        status: 'pending',
        transactionId: { not: null },
      },
    });

    if (existingPending) {
      throw new BadRequestException('A Stellar payout transaction is already pending for this payout');
    }

    const platformAddress =
      process.env.STELLAR_WALLET_ADDRESS || process.env.PLATFORM_WALLET_ADDRESS || '';
    if (!platformAddress) {
      throw new BadRequestException('Platform Stellar wallet address is not configured');
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

    const server = new StellarSdk.Horizon.Server(this.stellarService.horizonUrl);
    const sourceAccount = await server.loadAccount(platformAddress);

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

    const transactionId = transaction.hash().toString('hex');
    const stellarXdr = transaction.toXDR();

    const updated = await this.prisma.payout.update({
      where: { id: payoutId },
      data: {
        status: 'pending',
        transactionId,
        stellarXdr,
        externalTransactionId: transactionId,
        onChainTxHash: transactionId,
        lastAttemptAt: new Date(),
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

    if (payout.status === 'completed') {
      throw new BadRequestException(`Payout is already in ${payout.status} status`);
    }

    if (payout.status !== 'approved') {
      throw new BadRequestException(
        `Payout must be approved before processing (current status: ${payout.status})`,
      );
    }

    if (!payout.wallet) {
      throw new BadRequestException('No wallet associated with this payout');
    }

    await this.payoutValidationService.assertMinimumPayout(payout.amount, payout.currency);

    const platformSecret = process.env.STELLAR_PLATFORM_SECRET;
    if (!platformSecret) {
      throw new InternalServerErrorException(
        'STELLAR_PLATFORM_SECRET environment variable is not set',
      );
    }

    const sourceKeyPair = StellarSdk.Keypair.fromSecret(platformSecret);
    const server = new StellarSdk.Horizon.Server(this.stellarService.horizonUrl);

    try {
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
      const txHash = submitResult.hash;

      this.logger.log(`Verifying transaction ${txHash} for payout ${payoutId}`);
      const verification = await this.verifyTransaction(txHash);

      if (!verification.successful) {
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
          status: 'completed',
          transactionId: transaction.hash().toString('hex'),
          externalTransactionId: txHash,
          onChainTxHash: txHash,
          confirmedAt: confirmedTime,
          paidAt: confirmedTime,
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
        transactionId: transaction.hash().toString('hex'),
        onChainTxHash: txHash,
        confirmedAt: confirmedTime,
        paidAt: confirmedTime,
        status: 'completed',
        recipientEmail: payout.user.email,
        walletAddress: payout.wallet.address,
      });

      return {
        id: payout.id,
        status: 'completed',
        transactionId: transaction.hash().toString('hex'),
        externalTransactionId: txHash,
        onChainTxHash: txHash,
      };
    } catch (error) {
      this.logger.error(`Stellar payout failed for ${payoutId}:`, error);

      const newRetryCount = payout.retryCount + 1;
      const shouldRetry = newRetryCount < MAX_PAYOUT_RETRIES;

      await this.prisma.payout.update({
        where: { id: payoutId },
        data: {
          status: 'failed',
          retryCount: newRetryCount,
          lastAttemptAt: new Date(),
        },
      });

      if (shouldRetry) {
        const delay = Math.pow(PAYOUT_RETRY_BACKOFF_BASE, newRetryCount) * 1000;
        this.logger.log(
          `Scheduling retry ${newRetryCount} for payout ${payoutId} in ${delay}ms`,
        );

        await this.payoutRetryQueue.add(
          'retry-payout',
          { payoutId },
          { delay, attempts: MAX_PAYOUT_RETRIES - newRetryCount },
        );
      } else {
        this.logger.warn(
          `Payout ${payoutId} has reached max retries (${MAX_PAYOUT_RETRIES}) and will not be retried`,
        );
      }

      throw new InternalServerErrorException('Failed to process Stellar payout');
    }
  }

  async batchProcessPayouts(payoutIds: number[]): Promise<{
    processed: number; failed: number; results: Array<{ id: number; status: string; error?: string }>;
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
            throw new BadRequestException('No wallet associated with this payout');
          }

          await this.payoutValidationService.assertMinimumPayout(payout.amount, payout.currency);

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
                destination: payout.wallet.address,
                asset: StellarSdk.Asset.native(),
                amount: payout.amount.toString(),
              }),
            )
            .setTimeout(60)
            .build();

          transaction.sign(sourceKeyPair);

          const submitResult = await server.submitTransaction(transaction);
          const txHash = submitResult.hash;

          this.logger.log(`Verifying transaction ${txHash} for batch payout ${payoutId}`);
          const verification = await this.verifyTransaction(txHash);

          if (!verification.successful) {
            await tx.earningsAuditLog.create({
              data: {
                userId: payout.user.id,
                amount: payout.amount,
                actionType: 'payout_verification_failed',
              },
            });
            throw new Error(`Transaction verification failed for hash ${txHash}`);
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
              status: 'completed',
              transactionId: transaction.hash().toString('hex'),
              onChainTxHash: txHash,
              confirmedAt: confirmedTime,
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
            transactionId: transaction.hash().toString('hex'),
            onChainTxHash: txHash,
            confirmedAt: confirmedTime,
            paidAt: confirmedTime,
            status: 'completed',
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

  async confirmOneStellarPayout(
    payoutId: number,
    txHash: string,
    currentPollCount: number,
    userId: number,
    amount: number,
  ): Promise<void> {
    const result = await this.stellarService.getTransactionStatus(txHash);

    if (result.found) {
      if (result.successful) {
        const updated = await this.prisma.payout.updateMany({
          where: {
            id: payoutId,
            status: { in: ['pending', 'processing'] },
            confirmedAt: null,
          },
          data: {
            status: 'completed',
            confirmedAt: result.confirmedAt ?? new Date(),
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
        }
      } else {
        const updated = await this.prisma.payout.updateMany({
          where: { id: payoutId, status: { in: ['pending', 'processing'] } },
          data: { status: 'failed' },
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

    const newPollCount = currentPollCount + 1;
    if (newPollCount >= STELLAR_CONFIRMATION_MAX_POLLS) {
      const updated = await this.prisma.payout.updateMany({
        where: { id: payoutId, status: { in: ['pending', 'processing'] } },
        data: { status: 'failed', retryCount: newPollCount },
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
      await this.prisma.payout.update({
        where: { id: payoutId },
        data: { retryCount: newPollCount, lastAttemptAt: new Date() },
      });
    }
  }

  private async verifyTransaction(
    txHash: string,
  ): Promise<{ successful: boolean; confirmedAt?: Date }> {
    const maxPolls = 3;
    const pollIntervalMs = 1000;

    for (let attempt = 1; attempt <= maxPolls; attempt++) {
      try {
        const status = await this.stellarService.getTransactionStatus(txHash);
        if (status.found) {
          return {
            successful: !!status.successful,
            confirmedAt: status.confirmedAt,
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

    return { successful: false };
  }
}
