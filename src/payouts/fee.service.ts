import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface FeeResult {
  feeAmount: number;
  feePercentage: number;
  finalAmount: number;
}

@Injectable()
export class FeeService {
  private readonly DEFAULT_FEE_PERCENTAGE = 1;

  constructor(private readonly prisma: PrismaService) {}

  async calculateFee(amount: number, method: string): Promise<FeeResult> {
    const config = await this.prisma.payoutFeeConfig.findFirst({
      where: { method, isActive: true },
    });

    const feePercentage = config?.feePercentage ?? this.DEFAULT_FEE_PERCENTAGE;
    const fixedFee = config?.fixedFee ?? 0;

    let feeAmount = (amount * feePercentage) / 100 + fixedFee;

    if (config?.minFee) feeAmount = Math.max(feeAmount, config.minFee);
    if (config?.maxFee) feeAmount = Math.min(feeAmount, config.maxFee);

    feeAmount = Math.round(feeAmount * 100) / 100;
    const finalAmount = Math.round((amount - feeAmount) * 100) / 100;

    return { feeAmount, feePercentage, finalAmount };
  }
}
