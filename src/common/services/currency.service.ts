import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../redis/redis.service';

export enum SupportedCurrency {
  USD = 'USD',
  EUR = 'EUR',
  GBP = 'GBP',
  XLM = 'XLM',
  USDC = 'USDC',
}

const SUPPORTED_CURRENCIES = new Set<string>(Object.values(SupportedCurrency));

const CACHE_KEY_PREFIX = 'currency:rates:';
const CACHE_TTL_SECONDS = 3600;

const EXCHANGE_RATE_API_BASE = 'https://api.exchangerate-api.com/v4/latest';

@Injectable()
export class CurrencyService {
  private readonly logger = new Logger(CurrencyService.name);
  private readonly baseCurrency: string;

  constructor(private readonly redis: RedisService) {
    this.baseCurrency =
      process.env.DEFAULT_BASE_CURRENCY ?? SupportedCurrency.USD;
  }

  getBaseCurrency(): string {
    return this.baseCurrency;
  }

  isSupportedCurrency(currency: string): boolean {
    return SUPPORTED_CURRENCIES.has(currency.toUpperCase());
  }

  validateCurrency(currency: string): void {
    if (!this.isSupportedCurrency(currency)) {
      throw new Error(
        `Unsupported currency: ${currency}. Supported: ${[...SUPPORTED_CURRENCIES].join(', ')}`,
      );
    }
  }

  async getExchangeRate(from: string, to: string): Promise<number> {
    this.validateCurrency(from);
    this.validateCurrency(to);

    if (from.toUpperCase() === to.toUpperCase()) {
      return 1;
    }

    const cacheKey = `${CACHE_KEY_PREFIX}${from.toUpperCase()}:${to.toUpperCase()}`;
    const invertedCacheKey = `${CACHE_KEY_PREFIX}${to.toUpperCase()}:${from.toUpperCase()}`;

    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return parseFloat(cached);
    }

    const invertedCached = await this.redis.get(invertedCacheKey);
    if (invertedCached) {
      const rate = parseFloat(invertedCached);
      return rate > 0 ? 1 / rate : 0;
    }

    const rate = await this.fetchExchangeRate(from, to);
    if (rate !== null) {
      await this.redis.setex(cacheKey, CACHE_TTL_SECONDS, rate.toString());
    }
    return rate ?? 0;
  }

  async convert(
    amount: number,
    from: string,
    to: string,
  ): Promise<{ amount: number; rate: number }> {
    const rate = await this.getExchangeRate(from, to);
    return {
      amount: Math.round(amount * rate * 100) / 100,
      rate,
    };
  }

  async convertToBaseCurrency(
    amount: number,
    from: string,
  ): Promise<{ amountInBaseCurrency: number; rate: number }> {
    return this.convert(amount, from, this.baseCurrency);
  }

  private async fetchExchangeRate(
    from: string,
    to: string,
  ): Promise<number | null> {
    try {
      const fromUpper = from.toUpperCase();
      const toUpper = to.toUpperCase();

      const response = await fetch(`${EXCHANGE_RATE_API_BASE}/${fromUpper}`);
      if (!response.ok) {
        this.logger.warn(
          `Exchange rate API returned ${response.status} for ${fromUpper}`,
        );
        return null;
      }

      const data = (await response.json()) as {
        rates?: Record<string, number>;
      };
      if (!data.rates || !(toUpper in data.rates)) {
        this.logger.warn(
          `Rate for ${toUpper} not found in API response for ${fromUpper}`,
        );
        return null;
      }

      return data.rates[toUpper];
    } catch (error) {
      this.logger.error(
        `Failed to fetch exchange rate ${from}→${to}: ${(error as Error).message}`,
      );
      return null;
    }
  }

  async invalidateRatesCache(): Promise<void> {
    const client = this.redis.getClient();
    const keys = await client.keys(`${CACHE_KEY_PREFIX}*`);
    if (keys.length > 0) {
      await client.del(...keys);
    }
  }
}
