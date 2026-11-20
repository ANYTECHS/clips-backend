import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Fee breakdown returned by calculateFee / previewFee.
 * `amount` is the gross requested payout; `fee` is the platform fee;
 * `netAmount` is what the user receives (same as finalAmount).
 */
export interface FeeCalculation {
  /** Gross payout amount before fees */
  amount: number;
  /** Alias for amount (Swagger / API docs) */
  grossAmount: number;
  /** Total fee charged */
  fee: number;
  /** Alias for fee (persisted column name) */
  feeAmount: number;
  feePercentage: number;
  /** Net amount the user receives after fees */
  netAmount: number;
  /** Alias for netAmount (persisted column name) */
  finalAmount: number;
  currency: string;
}

@Injectable()
export class FeeService {
  private readonly logger = new Logger(FeeService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Calculate fees before processing a payout.
   * Supports fixed, percentage, or combined fee types per payout method.
   *
   * Example: $100 payout with 2% fee → { amount: 100, fee: 2, netAmount: 98 }
   */
  async calculateFee(
    amount: number,
    method: string,
    currency = 'USD',
  ): Promise<FeeCalculation> {
    if (amount == null || Number.isNaN(amount) || amount <= 0) {
      throw new BadRequestException('Payout amount must be a positive number');
    }

    const feeConfig = await this.prisma.payoutFeeConfig.findUnique({
      where: { method },
    });

    if (!feeConfig || !feeConfig.isActive) {
      this.logger.warn(`No active fee config found for method: ${method}`);
      return this.buildResult(amount, 0, 0, currency);
    }

    let totalFee = 0;
    const feeType = feeConfig.feeType || 'fixed';

    if (feeType === 'percentage') {
      totalFee = (amount * feeConfig.feePercentage) / 100;
    } else if (feeType === 'fixed') {
      totalFee = feeConfig.fixedFee;
    } else {
      // Legacy: combine fixed + percentage
      const percentageFee = (amount * feeConfig.feePercentage) / 100;
      totalFee = percentageFee + feeConfig.fixedFee;
    }

    const feeAmount = this.applyFeeBounds(
      totalFee,
      feeConfig.minFee,
      feeConfig.maxFee,
    );

    if (feeAmount >= amount) {
      throw new BadRequestException(
        `Fee (${feeAmount}) would leave a non-positive net payout for amount ${amount}. ` +
          `Choose a larger amount or a different payout method.`,
      );
    }

    const netAmount = this.roundMoney(amount - feeAmount);
    if (netAmount <= 0) {
      throw new BadRequestException(
        'Net payout must be greater than zero after fees',
      );
    }

    return this.buildResult(
      amount,
      this.roundMoney(feeAmount),
      feeConfig.feePercentage,
      currency,
      netAmount,
    );
  }

  /**
   * Preview fee for a given amount/method without creating a payout.
   * Used so users can see the fee before confirmation.
   */
  async previewFee(
    amount: number,
    method: string,
    currency = 'USD',
  ): Promise<FeeCalculation> {
    return this.calculateFee(amount, method, currency);
  }

  async getFeeConfig(method: string) {
    const feeConfig = await this.prisma.payoutFeeConfig.findUnique({
      where: { method },
    });

    if (!feeConfig) {
      throw new NotFoundException(`Fee config not found for method: ${method}`);
    }

    return feeConfig;
  }

  async getAllFeeConfigs() {
    return this.prisma.payoutFeeConfig.findMany();
  }

  async createFeeConfig(data: {
    method: string;
    feeType?: 'fixed' | 'percentage';
    feePercentage?: number;
    fixedFee?: number;
    minFee?: number;
    maxFee?: number;
  }) {
    return this.prisma.payoutFeeConfig.create({
      data: {
        method: data.method,
        feeType: data.feeType ?? 'fixed',
        feePercentage: data.feePercentage ?? 0,
        fixedFee: data.fixedFee ?? 0,
        minFee: data.minFee ?? 0,
        maxFee: data.maxFee,
      },
    });
  }

  async updateFeeConfig(
    method: string,
    data: {
      feeType?: 'fixed' | 'percentage';
      feePercentage?: number;
      fixedFee?: number;
      minFee?: number;
      maxFee?: number;
      isActive?: boolean;
    },
  ) {
    return this.prisma.payoutFeeConfig.update({
      where: { method },
      data,
    });
  }

  async deleteFeeConfig(method: string) {
    return this.prisma.payoutFeeConfig.delete({
      where: { method },
    });
  }

  private buildResult(
    amount: number,
    feeAmount: number,
    feePercentage: number,
    currency: string,
    netAmount?: number,
  ): FeeCalculation {
    const net = netAmount ?? this.roundMoney(amount - feeAmount);
    return {
      amount,
      grossAmount: amount,
      fee: feeAmount,
      feeAmount,
      feePercentage,
      netAmount: net,
      finalAmount: net,
      currency,
    };
  }

  private applyFeeBounds(fee: number, minFee: number, maxFee?: number): number {
    if (fee < minFee) {
      return minFee;
    }

    if (maxFee !== undefined && maxFee !== null && fee > maxFee) {
      return maxFee;
    }

    return fee;
  }

  private roundMoney(value: number): number {
    return Math.round(value * 100) / 100;
  }
}
