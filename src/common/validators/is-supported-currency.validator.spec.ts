import { ValidationArguments } from 'class-validator';
import {
  IsSupportedCurrencyConstraint,
  SUPPORTED_CURRENCY_CODES,
  normalizeCurrencyCode,
  isSupportedCurrencyCode,
} from './is-supported-currency.validator';

function makeArgs(value: unknown): ValidationArguments {
  return {
    value,
    constraints: [],
    targetName: 'TestDto',
    object: {},
    property: 'currency',
  };
}

describe('normalizeCurrencyCode', () => {
  it('uppercases and trims the input', () => {
    expect(normalizeCurrencyCode('  usd  ')).toBe('USD');
    expect(normalizeCurrencyCode('eur')).toBe('EUR');
    expect(normalizeCurrencyCode('XLM')).toBe('XLM');
  });
});

describe('isSupportedCurrencyCode', () => {
  it('accepts every code in SUPPORTED_CURRENCY_CODES', () => {
    for (const code of SUPPORTED_CURRENCY_CODES) {
      expect(isSupportedCurrencyCode(code)).toBe(true);
    }
  });

  it('accepts lowercase variants', () => {
    expect(isSupportedCurrencyCode('usd')).toBe(true);
    expect(isSupportedCurrencyCode('eur')).toBe(true);
    expect(isSupportedCurrencyCode('usdc')).toBe(true);
  });

  it('rejects unsupported codes', () => {
    expect(isSupportedCurrencyCode('JPY')).toBe(false);
    expect(isSupportedCurrencyCode('BTC')).toBe(false);
    expect(isSupportedCurrencyCode('AUD')).toBe(false);
    expect(isSupportedCurrencyCode('')).toBe(false);
  });
});

describe('IsSupportedCurrencyConstraint', () => {
  const validator = new IsSupportedCurrencyConstraint();

  describe('validate()', () => {
    it('accepts supported currencies (case-insensitive)', () => {
      expect(validator.validate('USD')).toBe(true);
      expect(validator.validate('usd')).toBe(true);
      expect(validator.validate('EUR')).toBe(true);
      expect(validator.validate('GBP')).toBe(true);
      expect(validator.validate('XLM')).toBe(true);
      expect(validator.validate('USDC')).toBe(true);
    });

    it('accepts values with surrounding whitespace after normalisation', () => {
      expect(validator.validate('  USD  ')).toBe(true);
    });

    it('rejects unsupported currency codes', () => {
      expect(validator.validate('JPY')).toBe(false);
      expect(validator.validate('BTC')).toBe(false);
      expect(validator.validate('CAD')).toBe(false);
      expect(validator.validate('AUD')).toBe(false);
    });

    it('rejects non-string values', () => {
      expect(validator.validate(123)).toBe(false);
      expect(validator.validate(null)).toBe(false);
      expect(validator.validate(undefined)).toBe(false);
      expect(validator.validate({})).toBe(false);
      expect(validator.validate(['USD'])).toBe(false);
    });

    it('rejects empty and blank strings', () => {
      expect(validator.validate('')).toBe(false);
      expect(validator.validate('   ')).toBe(false);
    });
  });

  describe('defaultMessage()', () => {
    it('names the unsupported value and lists accepted codes', () => {
      const msg = validator.defaultMessage(makeArgs('JPY'));
      expect(msg).toContain('JPY');
      for (const code of SUPPORTED_CURRENCY_CODES) {
        expect(msg).toContain(code);
      }
    });

    it('returns a type error message for non-strings', () => {
      const msg = validator.defaultMessage(makeArgs(42));
      expect(msg).toMatch(/must be a string/);
    });
  });
});
