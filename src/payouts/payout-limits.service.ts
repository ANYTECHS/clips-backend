import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';

export interface PayoutLimits {
  min: number;
  max: number;
}

@Injectable()
export class PayoutLimitsService {
  private readonly logger = new Logger(PayoutLimitsService.name);
  private readonly limitsByCurrency: Map<string, PayoutLimits>;

  constructor() {
    this.limitsByCurrency = this.loadLimits();
    this.logger.log(
      `Payout limits loaded for currencies: ${[...this.limitsByCurrency.keys()].join(', ')}`,
    );
  }

  getLimits(currency: string): PayoutLimits {
    const normalized = currency.toUpperCase();
    const limits = this.limitsByCurrency.get(normalized);

    if (!limits) {
      throw new BadRequestException(
        `Payout limits are not configured for currency ${normalized}.`,
      );
    }

    return limits;
  }

  /**
   * Validates available balance against limits and returns the payout amount
   * (capped at the per-currency maximum when balance exceeds it).
   */
  resolvePayoutAmount(availableBalance: number, currency: string): number {
    const { min, max } = this.getLimits(currency);

    if (availableBalance < min) {
      throw new BadRequestException(
        `Minimum payout for ${currency} is ${min}. Your available balance is ${availableBalance.toFixed(2)} ${currency}.`,
      );
    }

    if (availableBalance > max) {
      return max;
    }

    return availableBalance;
  }

  private loadLimits(): Map<string, PayoutLimits> {
    if (process.env.PAYOUT_LIMITS) {
      return this.parseJsonLimits(process.env.PAYOUT_LIMITS);
    }

    const limits = this.parseEnvPrefixLimits();
    this.applyUsdDefaults(limits);
    this.assertValidLimits(limits);
    return limits;
  }

  private parseJsonLimits(raw: string): Map<string, PayoutLimits> {
    let parsed: Record<string, { min: number; max: number }>;

    try {
      parsed = JSON.parse(raw) as Record<string, { min: number; max: number }>;
    } catch {
      throw new Error('PAYOUT_LIMITS must be valid JSON');
    }

    const limits = new Map<string, PayoutLimits>();

    for (const [currency, value] of Object.entries(parsed)) {
      limits.set(currency.toUpperCase(), {
        min: Number(value.min),
        max: Number(value.max),
      });
    }

    this.assertValidLimits(limits);
    return limits;
  }

  private parseEnvPrefixLimits(): Map<string, PayoutLimits> {
    const limits = new Map<string, PayoutLimits>();

    for (const [key, value] of Object.entries(process.env)) {
      if (!value) {
        continue;
      }

      const minMatch = /^MIN_PAYOUT_(.+)$/.exec(key);
      if (minMatch) {
        const currency = minMatch[1].toUpperCase();
        const existing = limits.get(currency) ?? { min: 0, max: Number.POSITIVE_INFINITY };
        limits.set(currency, {
          ...existing,
          min: parseFloat(value),
        });
        continue;
      }

      const maxMatch = /^MAX_PAYOUT_(.+)$/.exec(key);
      if (maxMatch) {
        const currency = maxMatch[1].toUpperCase();
        const existing = limits.get(currency) ?? { min: 0, max: Number.POSITIVE_INFINITY };
        limits.set(currency, {
          ...existing,
          max: parseFloat(value),
        });
      }
    }

    return limits;
  }

  private applyUsdDefaults(limits: Map<string, PayoutLimits>): void {
    const defaults = this.defaultUsdLimits();

    if (!limits.has('USD')) {
      limits.set('USD', defaults);
      return;
    }

    const usd = limits.get('USD')!;
    limits.set('USD', {
      min: usd.min > 0 ? usd.min : defaults.min,
      max: Number.isFinite(usd.max) ? usd.max : defaults.max,
    });
  }

  private defaultUsdLimits(): PayoutLimits {
    return {
      min: parseFloat(
        process.env.MIN_PAYOUT_USD ??
          process.env.MIN_STELLAR_PAYOUT ??
          '5',
      ),
      max: parseFloat(
        process.env.MAX_PAYOUT_USD ?? process.env.MAX_PAYOUT ?? '10000',
      ),
    };
  }

  private assertValidLimits(limits: Map<string, PayoutLimits>): void {
    for (const [currency, { min, max }] of limits) {
      if (
        Number.isNaN(min) ||
        Number.isNaN(max) ||
        min < 0 ||
        max < 0 ||
        min > max
      ) {
        throw new Error(
          `Invalid payout limits for ${currency}: min=${min}, max=${max}`,
        );
      }
    }
  }
}
