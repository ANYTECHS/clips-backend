import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { Horizon, TransactionBuilder, Networks, Operation, Asset } from '@stellar/stellar-sdk';
import { CreateStellarSubscriptionDto, StellarPaymentIntentDto } from './dto/create-stellar-subscription.dto';
import { StellarService } from '../stellar/stellar.service';
import { CircuitBreakerService, CircuitBreakerConfig } from '../common/circuit-breaker/circuit-breaker.service';

@Injectable()
export class StellarPaymentService {
  private server: any;
  private readonly logger = new Logger(StellarPaymentService.name);
  private readonly PAYMENT_EXPIRY_MINUTES = 15;

  private readonly horizonCircuitBreakerConfig: CircuitBreakerConfig = {
    name: 'stellar-payment-horizon',
    failureThreshold: 5,
    recoveryTimeout: 30000,
    samplingDuration: 60000,
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly stellarService: StellarService,
    private readonly circuitBreakerService: CircuitBreakerService,
  ) {
    this.server = new Horizon.Server(
      this.configService.get<string>('STELLAR_HORIZON_URL') || 'https://horizon-testnet.stellar.org',
    );
  }

  /**
   * Generate a payment intent for subscription
   */
  async createPaymentIntent(userId: number, dto: CreateStellarSubscriptionDto): Promise<StellarPaymentIntentDto> {
    // Get user's Stellar wallet
    const wallet = await this.prisma.wallet.findFirst({
      where: { 
        userId,
        ...(dto.walletId && { id: parseInt(dto.walletId) }),
      },
    });

    if (!wallet) {
      throw new Error('Stellar wallet not found. Please connect a wallet first.');
    }

    // Generate unique memo for payment tracking
    const memo = dto.memo || this.generatePaymentMemo(userId);
    
    // Create payment intent record
    const destination = dto.destinationAddress ?? wallet.address;
    const addressCheck = this.stellarService.validateAddress(destination);
    if (!addressCheck.valid) {
      throw new BadRequestException('Invalid Stellar address format');
    }

    const paymentIntent = await this.prisma.stellarPaymentIntent.create({
      data: {
        userId,
        amount: dto.amount,
        asset: dto.asset,
        destination,
        memo,
        status: 'pending',
        expiresAt: new Date(Date.now() + this.PAYMENT_EXPIRY_MINUTES * 60 * 1000),
        plan: dto.plan,
      },
    });

    return {
      id: paymentIntent.id,
      amount: dto.amount,
      asset: dto.asset,
      destination,
      memo,
      expiresAt: paymentIntent.expiresAt,
      status: 'pending',
    };
  }

  /**
   * Verify Stellar payment transaction
   */
  async verifyPayment(paymentIntentId: string, transactionHash: string): Promise<boolean> {
    try {
      // Get the transaction from Stellar network with circuit breaker
      const transaction = await this.circuitBreakerService.execute(
        this.horizonCircuitBreakerConfig,
        async () => this.server.transactionsTransaction(transactionHash),
      );

      // Get the payment intent
      const paymentIntent = await this.prisma.stellarPaymentIntent.findUnique({
        where: { id: paymentIntentId },
      });

      if (!paymentIntent || paymentIntent.status !== 'pending') {
        return false;
      }

      // Verify transaction details match our payment intent
      const payment = transaction.operations.find(op => op.type === 'payment') as Operation.Payment;

      if (!payment) {
        return false;
      }

      // Verify payment matches our intent
      const isValidPayment =
        payment.destination === paymentIntent.destination &&
        payment.asset.getCode() === paymentIntent.asset &&
        parseFloat(payment.amount) === paymentIntent.amount &&
        transaction.memo === paymentIntent.memo;

      if (!isValidPayment) {
        return false;
      }

      // Mark payment as completed
      await this.prisma.stellarPaymentIntent.update({
        where: { id: paymentIntentId },
        data: {
          status: 'completed',
          transactionHash,
        },
      });

      // Activate subscription
      await this.activateSubscription(paymentIntent.userId, paymentIntent.plan);

      return true;
    } catch (error) {
      if (error.name === 'ServiceUnavailableException') {
        this.logger.error(`Stellar service unavailable during payment verification: ${error.message}`);
        throw error;
      }
      this.logger.error(`Error verifying Stellar payment: ${error.message}`);
      return false;
    }
  }

  /**
   * Get pending payment intents for a user
   */
  async getPendingPaymentIntents(userId: number): Promise<StellarPaymentIntentDto[]> {
    const intents = await this.prisma.stellarPaymentIntent.findMany({
      where: {
        userId,
        status: 'pending',
        expiresAt: { gt: new Date() },
      },
    });

    return intents.map(intent => ({
      id: intent.id,
      amount: intent.amount,
      asset: intent.asset,
      destination: intent.destination,
      memo: intent.memo,
      expiresAt: intent.expiresAt,
      status: intent.status as 'pending' | 'completed' | 'expired',
    }));
  }

  /**
   * Activate subscription for a user
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
   * Generate unique payment memo
   */
  private generatePaymentMemo(userId: number): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substr(2, 5);
    return `CLIPS-${userId}-${timestamp}-${random}`;
  }

  /**
   * Process expired payment intents
   */
  async processExpiredPaymentIntents(): Promise<void> {
    await this.prisma.stellarPaymentIntent.updateMany({
      where: {
        status: 'pending',
        expiresAt: { lt: new Date() },
      },
      data: {
        status: 'expired',
      },
    });
  }

  async processDetectedPayment(params: {
    memo: string;
    amount: number;
    transactionId: string;
  }): Promise<boolean> {
    const duplicate = await this.prisma.stellarPaymentIntent.findFirst({
      where: {
        transactionId: params.transactionId,
        status: 'completed',
      },
    });

    if (duplicate) {
      return true;
    }

    const paymentIntent = await this.prisma.stellarPaymentIntent.findFirst({
      where: {
        memo: params.memo,
        status: 'pending',
      },
    });

    if (!paymentIntent) {
      return false;
    }

    if (paymentIntent.expiresAt.getTime() <= Date.now()) {
      await this.prisma.stellarPaymentIntent.update({
        where: { id: paymentIntent.id },
        data: { status: 'expired' },
      });
      return false;
    }

    if (paymentIntent.amount !== params.amount) {
      return false;
    }

    await this.prisma.stellarPaymentIntent.update({
      where: { id: paymentIntent.id },
      data: {
        status: 'completed',
        transactionId: params.transactionId,
      },
    });

    await this.activateSubscription(paymentIntent.userId, paymentIntent.plan);
    return true;
  }
}
