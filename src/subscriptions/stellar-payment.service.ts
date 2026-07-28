import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { Horizon } from '@stellar/stellar-sdk';
import {
  CreateStellarSubscriptionDto,
  StellarPaymentIntentDto,
} from './dto/create-stellar-subscription.dto';
import { StellarService } from '../stellar/stellar.service';
import {
  CircuitBreakerService,
  CircuitBreakerConfig,
} from '../common/circuit-breaker/circuit-breaker.service';

@Injectable()
export class StellarPaymentService {
  private server: Horizon.Server;
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
    this.server = new Horizon.Server(this.stellarService.horizonUrl);
  }

  /**
   * Generate a payment intent for subscription (XLM, USDC, or custom Stellar asset).
   */
  async createPaymentIntent(
    userId: number,
    dto: CreateStellarSubscriptionDto,
  ): Promise<StellarPaymentIntentDto> {
    const wallet = await this.prisma.wallet.findFirst({
      where: {
        userId,
        chain: 'stellar',
        ...(dto.walletId && { id: parseInt(dto.walletId) }),
      },
    });

    if (!wallet) {
      throw new BadRequestException(
        'Stellar wallet not found. Please connect a wallet first.',
      );
    }

    const memo = dto.memo || this.generatePaymentMemo(userId);
    const destination =
      dto.destinationAddress ??
      this.configService.get<string>('STELLAR_WALLET_ADDRESS');
    if (!destination) {
      throw new BadRequestException('STELLAR_WALLET_ADDRESS not configured');
    }
    const addressCheck = this.stellarService.validateAddress(destination);
    if (!addressCheck.valid) {
      throw new BadRequestException('Invalid Stellar address format');
    }

    const { asset, assetIssuer } = this.resolveAsset(dto);

    const paymentIntent = await this.prisma.stellarPaymentIntent.create({
      data: {
        userId,
        amount: dto.amount,
        asset,
        destination,
        memo,
        status: 'pending',
        expiresAt: new Date(
          Date.now() + this.PAYMENT_EXPIRY_MINUTES * 60 * 1000,
        ),
        plan: dto.plan,
      },
    });

    return {
      id: paymentIntent.id,
      amount: dto.amount,
      asset,
      destination,
      memo,
      expiresAt: paymentIntent.expiresAt,
      status: 'pending',
      assetIssuer,
    };
  }

  /**
   * Verify Stellar payment transaction.
   * On success: marks intent completed and activates subscription.
   * On failure: leaves subscription inactive and returns false.
   */
  async verifyPayment(
    paymentIntentId: string,
    transactionHash: string,
  ): Promise<boolean> {
    try {
      const transaction = await this.circuitBreakerService.execute(
        this.horizonCircuitBreakerConfig,
        async () =>
          this.server.transactions().transaction(transactionHash).call(),
      );

      const paymentIntent = await this.prisma.stellarPaymentIntent.findUnique({
        where: { id: paymentIntentId },
      });

      if (!paymentIntent || paymentIntent.status !== 'pending') {
        return false;
      }

      if (paymentIntent.expiresAt.getTime() <= Date.now()) {
        await this.prisma.stellarPaymentIntent.update({
          where: { id: paymentIntentId },
          data: { status: 'expired' },
        });
        return false;
      }

      const operationsPage = await transaction.operations().call();
      const operations = operationsPage.records;
      const payment = operations.find((op) => op.type === 'payment');

      if (!payment) {
        return false;
      }

      const paidAsset = this.extractPaidAsset(payment);
      const expected = this.parseStoredAsset(paymentIntent.asset);

      const isValidPayment =
        payment.destination === paymentIntent.destination &&
        this.assetsMatch(paidAsset, expected) &&
        parseFloat(payment.amount) === paymentIntent.amount &&
        transaction.memo === paymentIntent.memo;

      if (!isValidPayment) {
        this.logger.warn(
          `Stellar payment verification failed for intent ${paymentIntentId}`,
        );
        return false;
      }

      await this.prisma.stellarPaymentIntent.update({
        where: { id: paymentIntentId },
        data: {
          status: 'completed',
          transactionId: transactionHash,
        },
      });

      await this.activateSubscription(
        paymentIntent.userId,
        paymentIntent.plan,
        transactionHash,
        paymentIntent.memo,
      );

      return true;
    } catch (error) {
      if (error.name === 'ServiceUnavailableException') {
        this.logger.error(
          `Stellar service unavailable during payment verification: ${error.message}`,
        );
        throw error;
      }
      this.logger.error(`Error verifying Stellar payment: ${error.message}`);
      // Failed verification must leave subscription inactive
      return false;
    }
  }

  async getPendingPaymentIntents(
    userId: number,
  ): Promise<StellarPaymentIntentDto[]> {
    const intents = await this.prisma.stellarPaymentIntent.findMany({
      where: {
        userId,
        status: 'pending',
        expiresAt: { gt: new Date() },
      },
    });

    return intents.map((intent) => {
      const parsed = this.parseStoredAsset(intent.asset);
      return {
        id: intent.id,
        amount: intent.amount,
        asset: parsed.code,
        destination: intent.destination,
        memo: intent.memo,
        expiresAt: intent.expiresAt,
        status: intent.status as 'pending' | 'completed' | 'expired',
        assetIssuer: parsed.issuer,
      };
    });
  }

  private async activateSubscription(
    userId: number,
    plan: string,
    stellarTxHash?: string,
    stellarMemo?: string,
  ): Promise<void> {
    const planDurations: Record<string, number> = {
      pro: 30,
      agency: 30,
    };

    const duration = planDurations[plan] || 30;
    const startDate = new Date();
    const endDate = new Date(
      startDate.getTime() + duration * 24 * 60 * 60 * 1000,
    );

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

    await this.prisma.subscription.create({
      data: {
        userId,
        plan,
        status: 'active',
        paymentMethod: 'stellar',
        startDate,
        endDate,
        stellarTxHash,
        stellarMemo,
      },
    });
  }

  private generatePaymentMemo(userId: number): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substr(2, 5);
    return `CLIPS-${userId}-${timestamp}-${random}`;
  }

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

    await this.activateSubscription(
      paymentIntent.userId,
      paymentIntent.plan,
      params.transactionId,
      params.memo,
    );
    return true;
  }

  /**
   * Normalize asset selection into a stored code (and optional issuer).
   * XLM / USDC are uppercase; custom assets are stored as CODE:ISSUER.
   */
  private resolveAsset(dto: CreateStellarSubscriptionDto): {
    asset: string;
    assetIssuer: string | null;
  } {
    const kind = dto.asset.toLowerCase();

    if (kind === 'xlm') {
      return { asset: 'XLM', assetIssuer: null };
    }

    if (kind === 'usdc') {
      const issuer =
        this.configService.get<string>('STELLAR_USDC_ISSUER') ?? null;
      return {
        asset: issuer ? `USDC:${issuer}` : 'USDC',
        assetIssuer: issuer,
      };
    }

    // custom — future Stellar assets
    const code = dto.assetCode?.trim().toUpperCase();
    const issuer = dto.assetIssuer?.trim();
    if (!code || !issuer) {
      throw new BadRequestException(
        'Custom Stellar assets require assetCode and assetIssuer',
      );
    }
    const issuerCheck = this.stellarService.validateAddress(issuer);
    if (!issuerCheck.valid) {
      throw new BadRequestException('Invalid assetIssuer Stellar address');
    }
    return { asset: `${code}:${issuer}`, assetIssuer: issuer };
  }

  private parseStoredAsset(stored: string): {
    code: string;
    issuer: string | null;
  } {
    if (stored.includes(':')) {
      const [code, issuer] = stored.split(':');
      return { code: code.toUpperCase(), issuer: issuer || null };
    }
    return { code: stored.toUpperCase(), issuer: null };
  }

  private extractPaidAsset(payment: {
    asset_type: string;
    asset_code?: string;
    asset_issuer?: string;
  }): { code: string; issuer: string | null } {
    if (payment.asset_type === 'native') {
      return { code: 'XLM', issuer: null };
    }
    return {
      code: (payment.asset_code ?? '').toUpperCase(),
      issuer: payment.asset_issuer ?? null,
    };
  }

  private assetsMatch(
    paid: { code: string; issuer: string | null },
    expected: { code: string; issuer: string | null },
  ): boolean {
    if (paid.code !== expected.code) {
      return false;
    }
    // Native XLM has no issuer
    if (expected.code === 'XLM') {
      return true;
    }
    // If we stored an issuer, require an exact match; otherwise accept any issuer for that code
    if (!expected.issuer) {
      return true;
    }
    return paid.issuer === expected.issuer;
  }
}
