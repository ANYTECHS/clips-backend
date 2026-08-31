import { Injectable, Logger } from '@nestjs/common';
import { Currency } from './earnings.types';

export interface ConversionRate {
  [key: string]: number;
}

@Injectable()
export class CurrencyConversionService {
  private readonly logger = new Logger(CurrencyConversionService.name);

  // Default conversion rates (USD as base)
  private conversionRates: ConversionRate = {
    USD: 1.0,
    EUR: 0.92,
    GBP: 0.79,
    XLM: 10.5, // Example: 1 USD = 10.5 XLM
    USDC: 1.0,
  };

  constructor() {}

  /**
   * Convert an amount from one currency to another
   */
  convert(
    amount: number,
    fromCurrency: string,
    toCurrency: string,
  ): number {
    const from = (fromCurrency?.toUpperCase() || 'USD') as Currency;
    const to = (toCurrency?.toUpperCase() || 'USD') as Currency;

    if (from === to) {
      return amount;
    }

    const fromRate = this.conversionRates[from];
    const toRate = this.conversionRates[to];

    if (!fromRate || !toRate) {
      this.logger.warn(
        `Conversion rate not available for ${fromCurrency} or ${toCurrency}`,
      );
      return amount;
    }

    // Convert to base (USD) first, then to target currency
    const usdAmount = amount / fromRate;
    return usdAmount * toRate;
  }

  /**
   * Get conversion rate between two currencies
   */
  getRate(fromCurrency: Currency, toCurrency: Currency): number {
    if (fromCurrency === toCurrency) {
      return 1;
    }

    const fromRate = this.conversionRates[fromCurrency];
    const toRate = this.conversionRates[toCurrency];

    if (!fromRate || !toRate) {
      return 1;
    }

    return toRate / fromRate;
  }

  /** Returns a list of supported currency codes */
  getSupportedCurrencies(): string[] {
    return Object.keys(this.conversionRates);
  }

  /**
   * Update conversion rates (for future use with external API)
   */
  updateRates(newRates: ConversionRate): void {
    this.conversionRates = { ...this.conversionRates, ...newRates };
    this.logger.log('Conversion rates updated');
  }
}
