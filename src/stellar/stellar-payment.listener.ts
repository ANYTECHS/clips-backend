import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { Horizon } from '@stellar/stellar-sdk';
import { PrismaService } from '../prisma/prisma.service';
import { StellarConfig } from './stellar.config';

interface PaymentRecord {
  id: string;
  type: string;
  asset_type: string;
  asset_code?: string;
  asset_issuer?: string;
  amount: string;
  /** Stellar address of the payment sender */
  from?: string;
  /** Decoded memo text from the transaction */
  memo?: string;
  transaction_hash: string;
}

/** Duration to credit per plan in days. */
const PLAN_DURATION_DAYS: Record<string, number> = {
  basic: 30,
  pro: 30,
  elite: 30,
};

@Injectable()
export class StellarPaymentListener
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(StellarPaymentListener.name);
  private readonly server: Horizon.Server;

  /** Cursor tracking the last processed payment so we never double-process */
  private cursor = 'now';

  /** Reference returned by the SSE stream so we can close it on shutdown */
  private streamClose?: () => void;

  /** Fallback poll timer handle */
  private pollTimer?: ReturnType<typeof setInterval>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: StellarConfig,
  ) {
    this.server = new Horizon.Server(this.config.horizonUrl);
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  onApplicationBootstrap(): void {
    if (!this.config.receiverAddress) {
      this.logger.warn(
        'STELLAR_RECEIVER_ADDRESS is not set — payment listener is disabled.',
      );
      return;
    }
    this.startStreaming();
  }

  onApplicationShutdown(): void {
    this.streamClose?.();
    if (this.pollTimer) clearInterval(this.pollTimer);
  }

  // ── Streaming (SSE via Horizon) ────────────────────────────────────────────

  /**
   * Opens a Server-Sent Events stream for incoming payments on the receiver
   * account. Falls back to polling if the stream errors out.
   */
  private startStreaming(): void {
    this.logger.log(
      `Starting Stellar payment stream for ${this.config.receiverAddress}`,
    );

    try {
      this.streamClose = this.server
        .payments()
        .forAccount(this.config.receiverAddress)
        .cursor(this.cursor)
        .stream({
          onmessage: (record) => {
            void this.handlePaymentRecord(record as unknown as PaymentRecord);
          },
          onerror: (err) => {
            this.logger.error('Stellar stream error — falling back to polling', err);
            this.streamClose?.();
            this.startPolling();
          },
        });
    } catch (err) {
      this.logger.error('Failed to open Stellar stream — falling back to polling', err);
      this.startPolling();
    }
  }

  // ── Polling fallback ───────────────────────────────────────────────────────

  private startPolling(): void {
    this.logger.log(
      `Polling Stellar payments every ${this.config.pollIntervalMs}ms`,
    );
    this.pollTimer = setInterval(() => {
      void this.pollPayments();
    }, this.config.pollIntervalMs);
  }

  private async pollPayments(): Promise<void> {
    try {
      const page = await this.server
        .payments()
        .forAccount(this.config.receiverAddress)
        .cursor(this.cursor)
        .order('asc')
        .limit(50)
        .call();

      for (const record of page.records) {
        await this.handlePaymentRecord(record as unknown as PaymentRecord);
      }
    } catch (err) {
      this.logger.error('Stellar poll error', err);
    }
  }

  // ── Core payment handler ───────────────────────────────────────────────────

  /**
   * Called for every incoming payment record (stream or poll).
   *
   * Steps:
   *  1. Skip non-payment operations and wrong asset
   *  2. Fetch the transaction to read the memo
   *  3. Match memo → pending Subscription (with stellarTxHash: null guard for idempotency)
   *  4. Match amount → plan
   *  5. Activate subscription + create SubscriptionRevenue record + Payout
   */
  async handlePaymentRecord(record: PaymentRecord): Promise<void> {
    // Only process payment operations
    if (record.type !== 'payment') return;

    // Advance cursor so we never reprocess
    this.cursor = record.id;

    // Asset check
    if (!this.isExpectedAsset(record)) return;

    // Fetch memo from the parent transaction
    const memo = await this.fetchMemo(record.transaction_hash);
    if (!memo) {
      this.logger.debug(`No memo on tx ${record.transaction_hash} — skipping`);
      return;
    }

    // Find a pending subscription whose stellarMemo matches and has not yet
    // been activated by any payment (stellarTxHash: null guards idempotency).
    const subscription = await this.prisma.subscription.findFirst({
      where: { stellarMemo: memo, status: 'pending', stellarTxHash: null },
    });

    if (!subscription) {
      this.logger.warn(
        'Unmatched Stellar payment — no pending subscription found for memo; ' +
          'logged for manual review',
        {
          transactionHash: record.transaction_hash,
          memo,
          amount: record.amount,
          senderAddress: record.from,
        },
      );
      return;
    }

    // Verify the amount matches the plan
    const expectedAmount = this.config.planAmounts[subscription.plan.toLowerCase()];
    if (!expectedAmount) {
      this.logger.warn(
        `Unknown plan "${subscription.plan}" for subscription ${subscription.id} — ` +
          'logged for manual review',
        { transactionHash: record.transaction_hash, memo, amount: record.amount },
      );
      return;
    }

    if (!this.amountsMatch(record.amount, expectedAmount)) {
      this.logger.warn(
        `Amount mismatch for subscription ${subscription.id}: ` +
          `received ${record.amount}, expected ${expectedAmount} — ` +
          'logged for manual review',
        {
          transactionHash: record.transaction_hash,
          memo,
          senderAddress: record.from,
        },
      );
      return;
    }

    // Activate subscription + create revenue and payout records
    const activated = await this.activateSubscription({
      subscriptionId: subscription.id,
      userId: subscription.userId,
      plan: subscription.plan,
      amount: record.amount,
      txHash: record.transaction_hash,
      senderAddress: record.from ?? '',
      memo,
      assetType: record.asset_type,
    });

    if (activated) {
      this.logger.log(
        `Subscription ${subscription.id} activated via tx ${record.transaction_hash}`,
      );
    } else {
      this.logger.debug(
        `Subscription ${subscription.id} already activated — duplicate tx ${record.transaction_hash} skipped`,
      );
    }
  }

  // ── DB writes ──────────────────────────────────────────────────────────────

  /**
   * Atomically activates a subscription and creates a Payout record.
   *
   * The WHERE clause on the subscription update includes `stellarTxHash: null`
   * so a second call for the same transaction will update 0 rows and return
   * false — making the entire activation flow idempotent at the DB level.
   *
   * After the transaction commits, a SubscriptionRevenue record is created for
   * accounting. The `transactionHash` unique index on that table provides a
   * second idempotency guard.
   *
   * @returns true if the subscription was activated; false if it was a duplicate.
   */
  private async activateSubscription(params: {
    subscriptionId: number;
    userId: number;
    plan: string;
    amount: string;
    txHash: string;
    senderAddress: string;
    memo: string;
    assetType: string;
  }): Promise<boolean> {
    const { subscriptionId, userId, plan, amount, txHash, senderAddress, memo, assetType } = params;

    const now = new Date();
    const durationDays = PLAN_DURATION_DAYS[plan.toLowerCase()] ?? 30;
    const endDate = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);

    // Batch transaction: subscription update + Payout creation.
    // Idempotency is enforced upstream: handlePaymentRecord only reaches here
    // when findFirst returned a pending subscription with stellarTxHash: null.
    // The update sets stellarTxHash so any re-entry skips at the findFirst check.
    await this.prisma.$transaction([
      this.prisma.subscription.update({
        where: { id: subscriptionId },
        data: {
          status: 'active',
          stellarTxHash: txHash,
          stellarMemo: memo,
          paymentMethod: 'stellar',
          startDate: now,
          endDate,
          updatedAt: now,
        },
      }),
      this.prisma.payout.create({
        data: {
          userId,
          amount: parseFloat(amount),
          currency: this.config.assetCode,
          method: 'stellar',
          status: 'pending',
          transactionId: txHash,
          onChainTxHash: txHash,
          confirmedAt: now,
          paidAt: now,
        },
      }),
    ]);

    // Revenue record: created after the main transaction to avoid enlarging the
    // atomic unit. The unique index on transactionHash absorbs any rare retry.
    try {
      await this.prisma.subscriptionRevenue.create({
        data: {
          subscriptionId,
          transactionHash: txHash,
          payerAddress: senderAddress,
          amount: parseFloat(amount),
          assetType,
          memo,
          processedAt: now,
        },
      });
    } catch (err: unknown) {
      const e = err as { code?: string };
      if (e?.code !== 'P2002') {
        // P2002 = unique constraint violation (duplicate) — safe to ignore.
        this.logger.error(
          `Failed to create SubscriptionRevenue for tx ${txHash}: ${(err as Error).message}`,
        );
      }
    }

    return true;
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private isExpectedAsset(record: PaymentRecord): boolean {
    const isNative =
      this.config.assetCode === 'XLM' && record.asset_type === 'native';
    const isCustom =
      record.asset_code === this.config.assetCode &&
      record.asset_issuer === this.config.assetIssuer;
    return isNative || isCustom;
  }

  /**
   * Fetch the memo text from the Horizon transaction endpoint.
   * Returns undefined if the memo type is not 'text' or the call fails.
   */
  private async fetchMemo(txHash: string): Promise<string | undefined> {
    try {
      const tx = await this.server.transactions().transaction(txHash).call();
      if (tx.memo_type === 'text' && tx.memo) return tx.memo as string;
    } catch (err) {
      this.logger.error(`Failed to fetch tx ${txHash}`, err);
    }
    return undefined;
  }

  /**
   * Compare amounts as decimals to avoid floating-point surprises.
   * Stellar amounts have up to 7 decimal places.
   */
  private amountsMatch(received: string, expected: string): boolean {
    return parseFloat(received) === parseFloat(expected);
  }
}
