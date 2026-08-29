import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '../config/config.service';
import { CurrencyService } from '../common/services/currency.service';
import { PayoutLimitsService } from './payout-limits.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PayoutValidationService {
  private readonly logger = new Logger(PayoutValidationService.name);
  private readonly defaultPayoutCurrency =
    process.env.DEFAULT_PAYOUT_CURRENCY ?? 'USD';

  constructor(
    private readonly config: ConfigService,
    private readonly currencyService: CurrencyService,
    private readonly payoutLimitsService: PayoutLimitsService,
    private readonly prisma: PrismaService,
  ) {}

  async assertMinimumPayout(amount: number, currency?: string): Promise<void> {
    const minimum = this.config.minStellarPayout;
    const payoutCurrency = (currency ?? this.defaultPayoutCurrency).toUpperCase();
    const usdEquivalent = await this.toUsdEquivalent(amount, payoutCurrency);

    if (usdEquivalent < minimum) {
      const requested =
        payoutCurrency === 'USD'
          ? `${amount} USD`
          : `${amount} ${payoutCurrency} (~${usdEquivalent.toFixed(2)} USD)`;

      throw new BadRequestException(
        `Minimum payout amount is ${minimum} USD equivalent. Requested: ${requested}.`,
      );
    }
  }

  private async toUsdEquivalent(amount: number, currency: string): Promise<number> {
    if (currency === 'USD') {
      return amount;
    }

    try {
      const { amount: converted, rate } = await this.currencyService.convert(
        amount,
        currency,
        'USD',
      );

      if (!Number.isFinite(rate) || rate <= 0) {
        throw new Error(`no usable ${currency}->USD rate`);
      }

      return converted;
    } catch (error) {
      this.logger.warn(
        `Could not convert ${amount} ${currency} to USD for the minimum-payout check (` +
          `${error instanceof Error ? error.message : String(error)}); comparing the raw amount against the threshold instead.`,
      );
      return amount;
    }
  }

  assertPayoutLimits(amount: number, currency: string): void {
    const limits = this.payoutLimitsService.getLimits(currency);

    if (amount < limits.min) {
      throw new BadRequestException(
        `Minimum payout for ${currency} is ${limits.min}. Requested amount: ${amount}.`,
      );
    }

    if (amount > limits.max) {
      throw new BadRequestException(
        `Maximum payout for ${currency} is ${limits.max}. Requested amount: ${amount}.`,
      );
    }
  }

  async ensureNoOpenPayout(userId: number): Promise<void> {
    const existingPending = await this.prisma.payout.findFirst({
      where: { userId, status: { in: ['pending', 'pending_review', 'pending_approval', 'approved', 'processing'] } },
      select: { id: true },
    });

    if (existingPending) {
      throw new BadRequestException('A payout request is already pending for this user');
    }
  }

  assertPayoutState(
    status: string,
    allowed: string[],
    action: string,
  ): void {
    if (!allowed.includes(status)) {
      throw new BadRequestException(
        `${action} requires payout status to be one of: ${allowed.join(', ')} (current: ${status})`,
      );
    }
  }
}
