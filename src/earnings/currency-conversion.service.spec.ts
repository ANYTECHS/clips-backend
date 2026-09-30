import { Test } from '@nestjs/testing';
import { CurrencyConversionService } from './currency-conversion.service';
import type { Currency } from './earnings.types';

describe('CurrencyConversionService (#1026)', () => {
  let service: CurrencyConversionService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [CurrencyConversionService],
    }).compile();

    service = moduleRef.get(CurrencyConversionService);
  });

  describe('convert', () => {
    it('returns the amount unchanged when both currencies match', () => {
      expect(service.convert(50, 'USD', 'USD')).toBe(50);
    });

    it('matches currencies case-insensitively', () => {
      expect(service.convert(50, 'usd', 'Usd')).toBe(50);
    });

    it('defaults both currencies to USD when omitted', () => {
      expect(service.convert(50, '', '')).toBe(50);
    });

    it('converts USD to EUR using the seeded rate', () => {
      expect(service.convert(100, 'USD', 'EUR')).toBeCloseTo(92, 5);
    });

    it('converts EUR back to USD', () => {
      expect(service.convert(92, 'EUR', 'USD')).toBeCloseTo(100, 5);
    });

    it('converts USD to XLM', () => {
      expect(service.convert(2, 'USD', 'XLM')).toBeCloseTo(21, 5);
    });

    it('converts XLM to USD', () => {
      expect(service.convert(21, 'XLM', 'USD')).toBeCloseTo(2, 5);
    });

    it('treats USDC as a 1:1 stablecoin', () => {
      expect(service.convert(75, 'USDC', 'USD')).toBeCloseTo(75, 5);
      expect(service.convert(75, 'USD', 'USDC')).toBeCloseTo(75, 5);
    });

    it('handles zero amounts', () => {
      expect(service.convert(0, 'USD', 'EUR')).toBe(0);
    });

    it('round-trips through a non-USD currency', () => {
      const forward = service.convert(100, 'USD', 'GBP');
      expect(service.convert(forward, 'GBP', 'USD')).toBeCloseTo(100, 5);
    });

    it('returns the amount unchanged for an unknown source currency', () => {
      expect(service.convert(10, 'XYZ', 'USD')).toBe(10);
    });

    it('returns the amount unchanged for an unknown target currency', () => {
      expect(service.convert(10, 'USD', 'ZZZ')).toBe(10);
    });

    it('returns the amount unchanged when both currencies are unknown', () => {
      expect(service.convert(10, 'AAA', 'BBB')).toBe(10);
    });
  });

  describe('getRate', () => {
    it('returns 1 for identical currencies', () => {
      expect(service.getRate('USD', 'USD')).toBe(1);
      expect(service.getRate('EUR', 'EUR')).toBe(1);
    });

    it('returns the USD to EUR rate', () => {
      expect(service.getRate('USD', 'EUR')).toBeCloseTo(0.92, 5);
    });

    it('returns the reciprocal for EUR to USD', () => {
      expect(service.getRate('EUR', 'USD')).toBeCloseTo(1 / 0.92, 5);
    });

    it('returns 1 for an unknown source currency', () => {
      expect(service.getRate('NOPE' as Currency, 'USD')).toBe(1);
    });

    it('returns 1 for an unknown target currency', () => {
      expect(service.getRate('USD', 'NOPE' as Currency)).toBe(1);
    });
  });

  describe('getSupportedCurrencies / isSupported', () => {
    it('lists the seeded currencies', () => {
      expect(service.getSupportedCurrencies().sort()).toEqual([
        'EUR',
        'GBP',
        'USD',
        'USDC',
        'XLM',
      ]);
    });

    it('recognises every seeded currency', () => {
      for (const currency of service.getSupportedCurrencies()) {
        expect(service.isSupported(currency)).toBe(true);
      }
    });

    it('is case-insensitive', () => {
      expect(service.isSupported('eur')).toBe(true);
      expect(service.isSupported('xLm')).toBe(true);
    });

    it('rejects an unknown currency', () => {
      expect(service.isSupported('JPY')).toBe(false);
    });

    it('rejects an empty currency', () => {
      expect(service.isSupported('')).toBe(false);
    });

    it('rejects a missing currency', () => {
      expect(service.isSupported(undefined as unknown as string)).toBe(false);
    });
  });

  describe('validateCurrencyOrThrow', () => {
    it('passes for a supported currency', () => {
      expect(() => service.validateCurrencyOrThrow('USD')).not.toThrow();
      expect(() => service.validateCurrencyOrThrow('xlm')).not.toThrow();
    });

    it('throws for an unsupported currency and lists the supported set', () => {
      expect(() => service.validateCurrencyOrThrow('JPY')).toThrow(
        'Unsupported currency: JPY. Supported: USD, EUR, GBP, XLM, USDC',
      );
    });

    it('throws for an empty currency', () => {
      expect(() => service.validateCurrencyOrThrow('')).toThrow(
        'Unsupported currency: ',
      );
    });
  });

  describe('updateRates', () => {
    it('adds a new currency', () => {
      service.updateRates({ JPY: 150 });

      expect(service.isSupported('JPY')).toBe(true);
      expect(service.getSupportedCurrencies()).toContain('JPY');
    });

    it('converts using an updated rate', () => {
      service.updateRates({ JPY: 150 });

      expect(service.convert(1, 'USD', 'JPY')).toBe(150);
      expect(service.convert(150, 'JPY', 'USD')).toBeCloseTo(1, 5);
    });

    it('overrides an existing rate without dropping other currencies', () => {
      service.updateRates({ EUR: 0.5 });

      expect(service.convert(100, 'USD', 'EUR')).toBe(50);
      expect(service.getSupportedCurrencies()).toContain('GBP');
    });

    it('merges multiple rates in one call', () => {
      service.updateRates({ JPY: 150, CHF: 0.9 });

      expect(service.getSupportedCurrencies().sort()).toEqual([
        'CHF',
        'EUR',
        'GBP',
        'JPY',
        'USD',
        'USDC',
        'XLM',
      ]);
    });

    it('does not mutate the previous rate map', () => {
      const before = service.getSupportedCurrencies();
      service.updateRates({ JPY: 150 });

      expect(before).not.toContain('JPY');
    });
  });
});
