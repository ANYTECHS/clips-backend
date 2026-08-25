import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface FeeCalculation {
  feeAmount: number;
  feePercentage: number;
  finalAmount: number;
}

@Injectable()
export class FeeService {
  private readonly logger = new Logger(FeeService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Calculate fees before processing a payout
   * Supports both fixed and percentage fee types
   * Example: $100 payout with 2% platform fee ($2) + $1 network fee = $97 user receives
   * @param amount The payout amount in cents/smallest unit
   * @param method The payout method (e.g., 'stellar', 'stripe', 'ach')
   * @returns Fee calculation with breakdowns
   */
  async calculateFee(amount: number, method: string): Promise<FeeCalculation> {
    const feeConfig = await this.prisma.payoutFeeConfig.findUnique({
      where: { method },
    });

    if (!feeConfig || !feeConfig.isActive) {
      this.logger.warn(`No active fee config found for method: ${method}`);
      return {
        feeAmount: 0,
        feePercentage: 0,
        finalAmount: amount,
      };
    }

    let totalFee = 0;
    const feeType = feeConfig.feeType || 'fixed';

    if (feeType === 'percentage') {
      // Calculate percentage fee
      totalFee = (amount * feeConfig.feePercentage) / 100;
    } else if (feeType === 'fixed') {
      // Use fixed fee
      totalFee = feeConfig.fixedFee;
    } else {
      // Default: combine both fixed and percentage (legacy behavior)
      const percentageFee = (amount * feeConfig.feePercentage) / 100;
      totalFee = percentageFee + feeConfig.fixedFee;
    }

    const feeAmount = this.applyFeeBounds(
      totalFee,
      feeConfig.minFee,
      feeConfig.maxFee,
    );

    const finalAmount = amount - feeAmount;

    return {
      feeAmount,
      feePercentage: feeConfig.feePercentage,
      finalAmount,
    };
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

  private applyFeeBounds(fee: number, minFee: number, maxFee?: number): number {
    if (fee < minFee) {
      return minFee;
    }

    if (maxFee !== undefined && maxFee !== null && fee > maxFee) {
      return maxFee;
    }

    return fee;
  }
}
