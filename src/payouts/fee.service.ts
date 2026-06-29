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

    const percentageFee = (amount * feeConfig.feePercentage) / 100;
    const totalFee = percentageFee + feeConfig.fixedFee;

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
    feePercentage: number;
    fixedFee?: number;
    minFee?: number;
    maxFee?: number;
  }) {
    return this.prisma.payoutFeeConfig.create({
      data: {
        method: data.method,
        feePercentage: data.feePercentage,
        fixedFee: data.fixedFee ?? 0,
        minFee: data.minFee ?? 0,
        maxFee: data.maxFee,
      },
    });
  }

  async updateFeeConfig(
    method: string,
    data: {
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
