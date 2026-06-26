import { Injectable, Logger, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { Horizon } from '@stellar/stellar-sdk';
import * as crypto from 'crypto';
import { StellarPaymentService } from './stellar-payment.service';
import { StellarService } from '../stellar/stellar.service';

@Injectable()
export class StellarWebhookService {
  private readonly logger = new Logger(StellarWebhookService.name);
  private horizon: Horizon.Server;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly stellarPaymentService: StellarPaymentService,
    private readonly stellarService: StellarService,
  ) {
    this.horizon = new Horizon.Server(this.stellarService.horizonUrl);
  }

  /**
   * Start listening for Stellar transactions
   */
  async startTransactionListener(): Promise<void> {
    try {
      const stellarWalletAddress = this.configService.get<string>('STELLAR_WALLET_ADDRESS');
      if (!stellarWalletAddress) {
        this.logger.warn('STELLAR_WALLET_ADDRESS not configured, not starting transaction listener');
        return;
      }

      this.logger.log('Starting Stellar transaction listener...');

      // Listen for account transactions (for payment monitoring)
      this.horizon.transactions()
        .forAccount(stellarWalletAddress)
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
      // Fetch operations for the transaction
      const operationsPage = await transaction.operations().call();
      const operations = operationsPage.records;

      // Look for payment operations with our memo format
      const paymentOperations = operations
        .filter((op: any) => op.type === 'payment');

      for (const payment of paymentOperations) {
        // The memo is on the transaction, not the operation
        const memo = transaction.memo;
        if (memo && memo.startsWith('CLIPS-')) {
          await this.processPayment(payment, transaction, memo);
        }
      }
    } catch (error) {
      this.logger.error('Error handling transaction:', error);
    }
  }

  /**
   * Process payment from transaction
   */
  private async processPayment(payment: any, transaction: any, memo: string): Promise<void> {
    try {
      // Get asset code
      const assetCode = payment.asset_type === 'native' ? 'XLM' : payment.asset_code;

      // Use the StellarPaymentService to process detected payment
      const processed = await this.stellarPaymentService.processDetectedPayment({
        memo,
        amount: parseFloat(payment.amount),
        transactionId: transaction.hash,
      });

      if (processed) {
        this.logger.log(`Payment processed and subscription activated for memo: ${memo}`);
      }
    } catch (error) {
      this.logger.error('Error processing payment:', error);
    }
  }

  /**
   * Verify webhook signature using HMAC-SHA256 with constant-time comparison
   * @param payload - Raw request body
   * @param signature - Signature from X-Webhook-Signature header (hex encoded)
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
   * Log processed webhook for idempotency
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
      // For webhook, we'll need to fetch the full transaction from Horizon
      const transaction = await this.horizon.transactions().transaction(transactionId).call();
      await this.handleTransaction(transaction);
      this.logger.log(`Webhook processed successfully for transaction: ${transactionId}`);
      return { success: true, message: 'Webhook processed successfully' };
    } catch (error) {
      this.logger.error(`Error processing webhook: ${error.message}`);
      throw new BadRequestException(`Webhook processing failed: ${error.message}`);
    }
  }
}
