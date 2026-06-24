import { Injectable, Logger, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import Server, { Horizon } from '@stellar/stellar-sdk';
import * as crypto from 'crypto';

@Injectable()
export class StellarWebhookService {
  private readonly logger = new Logger(StellarWebhookService.name);
  private server: any;
  private horizon: any;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    this.server = new Server(
      this.configService.get<string>('STELLAR_HORIZON_URL') || 'https://horizon-testnet.stellar.org',
    );
    this.horizon = new Horizon.Server(
      this.configService.get<string>('STELLAR_HORIZON_URL') || 'https://horizon-testnet.stellar.org',
    );
  }

  /**
   * Start listening for Stellar transactions
   */
  async startTransactionListener(): Promise<void> {
    try {
      this.logger.log('Starting Stellar transaction listener...');

      // Listen for account transactions (for payment monitoring)
      this.horizon.transactions()
        .forAccount(this.configService.get<string>('STELLAR_WALLET_ADDRESS'))
        .cursor('now')
        .stream({
          onmessage: (transaction) => {
            this.handleTransaction(transaction);
          },
          onerror: (error) => {
            this.logger.error('Stream error:', error);
          },
        })
        .catch((error: any) => {
          this.logger.error('Failed to start transaction stream:', error);
        });

    } catch (error) {
      this.logger.error('Error setting up Stellar webhook:', error);
    }
  }

  /**
   * Handle incoming Stellar transaction
   */
  private async handleTransaction(transaction: any): Promise<void> {
    try {
      // Look for payment operations with our memo format
      const paymentOperations = transaction.operations
        .filter((op: any) => op.type === 'payment')
        .filter((op: any) => op.memo && op.memo.startsWith && op.memo.startsWith('CLIPS-'));

      for (const payment of paymentOperations) {
        await this.processPayment(payment, transaction);
      }
    } catch (error) {
      this.logger.error('Error handling transaction:', error);
    }
  }

  /**
   * Process payment from transaction
   */
  private async processPayment(payment: any, transaction: any): Promise<void> {
    try {
      // Extract memo to find payment intent
      const memo = payment.memo;
      
      // Find payment intent by memo
      const paymentIntent = await this.prisma.stellarPaymentIntent.findFirst({
        where: {
          memo,
          status: 'pending',
        },
      });

      if (!paymentIntent) {
        this.logger.warn(`Payment intent not found for memo: ${memo}`);
        return;
      }

      // Verify payment details
      const isValidPayment = 
        payment.destination === paymentIntent.destination &&
        payment.asset_code === paymentIntent.asset &&
        parseFloat(payment.amount) === paymentIntent.amount;

      if (!isValidPayment) {
        this.logger.warn(`Payment validation failed for intent: ${paymentIntent.id}`);
        return;
      }

      // Update payment intent as completed
      await this.prisma.stellarPaymentIntent.update({
        where: { id: paymentIntent.id },
        data: {
          status: 'completed',
          transactionId: transaction.hash,
        },
      });

      // Activate subscription
      await this.activateSubscription(paymentIntent.userId, paymentIntent.plan);

      this.logger.log(`Payment processed and subscription activated for user: ${paymentIntent.userId}`);
    } catch (error) {
      this.logger.error('Error processing payment:', error);
    }
  }

  /**
   * Activate subscription for user
   */
  private async activateSubscription(userId: number, plan: string): Promise<void> {
    const planDurations = {
      'pro': 30, // 30 days
      'agency': 30, // 30 days
    };

    const duration = planDurations[plan] || 30;
    const startDate = new Date();
    const endDate = new Date(startDate.getTime() + duration * 24 * 60 * 60 * 1000);

    // Deactivate existing subscriptions
    await this.prisma.subscription.updateMany({
      where: {
        userId,
        status: 'active',
      },
      data: {
        status: 'cancelled',
        endDate: new Date(),
      },
    });

    // Create new subscription
    await this.prisma.subscription.create({
      data: {
        userId,
        plan,
        status: 'active',
        paymentMethod: 'stellar',
        startDate,
        endDate,
      },
    });
  }

  /**
   * Verify webhook signature using HMAC-SHA256 with constant-time comparison
   * @param payload - Raw request body
   * @param signature - Signature from X-Webhook-Signature header (hex format)
   * @returns boolean indicating if signature is valid
   * @throws UnauthorizedException if WEBHOOK_SECRET is not configured
   */
  verifyWebhookSignature(payload: string | Buffer, signature: string): boolean {
    const secret = this.configService.get<string>('WEBHOOK_SECRET');

    if (!secret) {
      this.logger.error('WEBHOOK_SECRET not configured');
      throw new UnauthorizedException('Webhook secret not configured');
    }

    if (!signature) {
      this.logger.warn('Missing webhook signature');
      return false;
    }

    // Compute expected signature
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');

    // Constant-time comparison to prevent timing attacks
    try {
      return crypto.timingSafeEqual(
        Buffer.from(signature, 'hex'),
        Buffer.from(expectedSignature, 'hex'),
      );
    } catch (error) {
      // Signature lengths don't match or other error
      this.logger.warn('Signature verification failed - length mismatch or invalid format');
      return false;
    }
  }

  /**
   * Check if webhook has already been processed (idempotency)
   * @param transactionId - Stellar transaction hash
   * @returns boolean indicating if webhook was already processed
   */
  async isDuplicateWebhook(transactionId: string): Promise<boolean> {
    try {
      const existing = await this.prisma.stellarWebhookLog.findUnique({
        where: { transactionId },
      });
      return !!existing;
    } catch (error) {
      this.logger.error(`Error checking duplicate webhook: ${error.message}`);
      // If we can't check, assume not duplicate to avoid blocking valid payments
      return false;
    }
  }

  /**
   * Log processed webhook for idempotency tracking
   * @param transactionId - Stellar transaction hash
   * @param payload - Webhook payload for audit
   */
  async logWebhookDelivery(transactionId: string, payload: any): Promise<void> {
    try {
      await this.prisma.stellarWebhookLog.create({
        data: {
          transactionId,
          payload: JSON.stringify(payload),
          processedAt: new Date(),
        },
      });
    } catch (error) {
      // Log but don't throw - duplicate key exception is expected for retries
      if (error.code === 'P2002') {
        this.logger.debug(`Webhook ${transactionId} already logged`);
      } else {
        this.logger.error(`Error logging webhook: ${error.message}`);
      }
    }
  }

  /**
   * Process incoming webhook with full verification and idempotency
   * @param payload - Raw webhook payload
   * @param signature - X-Webhook-Signature header value
   * @throws UnauthorizedException for invalid signature
   * @throws BadRequestException for duplicate or invalid webhooks
   */
  async processWebhook(payload: string | Buffer, signature: string): Promise<{ success: boolean; message: string }> {
    // Verify signature
    const isValidSignature = this.verifyWebhookSignature(payload, signature);
    if (!isValidSignature) {
      this.logger.warn('Invalid webhook signature');
      throw new UnauthorizedException('Invalid webhook signature');
    }

    // Parse payload
    let webhookData: any;
    try {
      webhookData = JSON.parse(payload.toString());
    } catch (error) {
      this.logger.error('Invalid webhook payload format');
      throw new BadRequestException('Invalid JSON payload');
    }

    // Validate required fields
    const transactionId = webhookData.transaction_hash || webhookData.hash;
    if (!transactionId) {
      this.logger.error('Missing transaction hash in webhook payload');
      throw new BadRequestException('Missing transaction hash');
    }

    // Check for duplicates
    const isDuplicate = await this.isDuplicateWebhook(transactionId);
    if (isDuplicate) {
      this.logger.log(`Duplicate webhook received for transaction: ${transactionId}`);
      return { success: true, message: 'Duplicate webhook - already processed' };
    }

    // Log webhook for idempotency
    await this.logWebhookDelivery(transactionId, webhookData);

    // Process the webhook
    try {
      await this.handleTransaction(webhookData);
      this.logger.log(`Webhook processed successfully for transaction: ${transactionId}`);
      return { success: true, message: 'Webhook processed successfully' };
    } catch (error) {
      this.logger.error(`Error processing webhook: ${error.message}`);
      throw new BadRequestException(`Webhook processing failed: ${error.message}`);
    }
  }
}
