import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Horizon } from '@stellar/stellar-sdk';
import { PrismaService } from '../prisma/prisma.service';
import { StellarService } from './stellar.service';

/**
 * Listens for incoming Stellar payments to the platform account
 * and automatically activates subscriptions based on memo + amount matching.
 *
 * Payment flow:
 * 1. User sends XLM to platform wallet with memo = subscription plan ID
 * 2. Listener detects the payment
 * 3. Finds matching inactive subscription
 * 4. Activates subscription and updates subscription record
 * 5. Optionally creates payout record for accounting
 */
@Injectable()
export class StellarPaymentListenerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(StellarPaymentListenerService.name);
  private paymentStreamUrl: string | null = null;
  private streamAbort: AbortController | null = null;

  private readonly PLATFORM_WALLET = process.env.PLATFORM_WALLET;
  private readonly PLATFORM_ACCOUNT_ID = process.env.PLATFORM_ACCOUNT_ID;

  constructor(
    private readonly prisma: PrismaService,
    private readonly stellarService: StellarService,
  ) {}

  async onModuleInit() {
    // Start listening for payments if platform wallet is configured
    if (!this.PLATFORM_WALLET && !this.PLATFORM_ACCOUNT_ID) {
      this.logger.warn(
        'PLATFORM_WALLET and PLATFORM_ACCOUNT_ID not configured. Payment listener disabled.',
      );
      return;
    }

    this.startPaymentListener();
  }

  async onModuleDestroy() {
    this.stopPaymentListener();
  }

  /**
   * Start listening for payments using Horizon streaming
   */
  private startPaymentListener() {
    try {
      const server = new Horizon.Server(this.stellarService.horizonUrl);
      const accountId = this.PLATFORM_ACCOUNT_ID || this.PLATFORM_WALLET;

      if (!accountId) {
        this.logger.error('No platform account configured');
        return;
      }

      this.streamAbort = new AbortController();

      // Use experimental streaming API if available, otherwise poll
      server
        .payments()
        .forAccount(accountId)
        .cursor('now')
        .stream({
          onmessage: (payment: any) => this.handlePaymentEvent(payment),
          onerror: (error: any) => {
            this.logger.error(
              `Horizon payment stream error: ${error?.message || error}`,
            );
            // Reconnect after delay
            setTimeout(() => this.startPaymentListener(), 5000);
          },
        });

      this.logger.log(
        `Payment listener started for account: ${accountId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to start payment listener: ${error instanceof Error ? error.message : error}`,
      );
      // Retry after delay
      setTimeout(() => this.startPaymentListener(), 5000);
    }
  }

  /**
   * Stop listening for payments
   */
  private stopPaymentListener() {
    if (this.streamAbort) {
      this.streamAbort.abort();
      this.streamAbort = null;
    }
  }

  /**
   * Handle incoming payment events from Horizon
   * Match: memo (subscription plan) + amount
   */
  private async handlePaymentEvent(payment: any) {
    try {
      const { memo, memo_type, amount, from } = payment;

      this.logger.debug(
        `Payment received: amount=${amount}, memo=${memo}, memo_type=${memo_type}, from=${from}`,
      );

      // Only process native asset (XLM) payments
      if (payment.asset_type !== 'native') {
        this.logger.debug('Ignoring non-native asset payment');
        return;
      }

      // Require text memo for subscription matching
      if (memo_type !== 'text' || !memo) {
        this.logger.debug('Payment has no text memo, skipping subscription matching');
        return;
      }

      // Parse memo as subscription plan (e.g., "pro", "enterprise")
      const plan = memo.toLowerCase().trim();
      const amountXlm = parseFloat(amount);

      // Find inactive subscription matching plan from sender
      const subscription = await this.prisma.subscription.findFirst({
        where: {
          status: 'inactive',
          plan: plan,
          user: {
            wallets: {
              some: { address: from },
            },
          },
        },
        include: { user: true },
      });

      if (!subscription) {
        this.logger.debug(
          `No matching inactive subscription found for plan=${plan}, from=${from}`,
        );
        return;
      }

      // Verify amount matches plan rate (basic example: 10 XLM per plan)
      const expectedAmount = this.getPlanAmount(plan);
      if (Math.abs(amountXlm - expectedAmount) > 0.1) {
        this.logger.warn(
          `Payment amount mismatch: received ${amountXlm} XLM, expected ~${expectedAmount} XLM for plan=${plan}`,
        );
        return;
      }

      // Update subscription to active
      const updatedSubscription = await this.prisma.subscription.update({
        where: { id: subscription.id },
        data: {
          status: 'active',
          startDate: new Date(),
          stellarTxHash: payment.transaction_hash,
          stellarMemo: memo,
        },
      });

      this.logger.log(
        `Subscription ${subscription.id} activated for user ${subscription.userId}`,
      );

      // Optional: Create payout record for accounting (future feature)
      // await this.prisma.payout.create({
      //   data: {
      //     userId: subscription.userId,
      //     amount: amountXlm,
      //     currency: 'XLM',
      //     method: 'stellar_payment',
      //     status: 'completed',
      //     onChainTxHash: payment.transaction_hash,
      //     confirmedAt: new Date(),
      //   },
      // });
    } catch (error) {
      this.logger.error(
        `Error handling payment event: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  /**
   * Get expected XLM amount for a subscription plan
   * TODO: Load from database configuration or env
   */
  private getPlanAmount(plan: string): number {
    const amounts: Record<string, number> = {
      free: 0,
      pro: 10,
      enterprise: 50,
      starter: 5,
    };
    return amounts[plan] || 10;
  }

  /**
   * Manual polling fallback for subscription activation
   * Call periodically if streaming is not available
   */
  async pollForPayments() {
    try {
      const server = new Horizon.Server(this.stellarService.horizonUrl);
      const accountId = this.PLATFORM_ACCOUNT_ID || this.PLATFORM_WALLET;

      if (!accountId) {
        return;
      }

      const response = await server
        .payments()
        .forAccount(accountId)
        .limit(100)
        .order('desc')
        .call();

      // Process recent payments
      const records = response.records as any[];
      for (const payment of records) {
        await this.handlePaymentEvent(payment);
      }
    } catch (error) {
      this.logger.error(
        `Polling error: ${error instanceof Error ? error.message : error}`,
      );
    }
  }
}
