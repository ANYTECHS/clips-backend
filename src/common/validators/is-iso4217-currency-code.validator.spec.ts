import { ValidationArguments } from 'class-validator';
import { IsIso4217CurrencyCodeConstraint } from './is-iso4217-currency-code.validator';

function makeArgs(property = 'currency'): ValidationArguments {
  return {
    value: undefined,
    constraints: [],
    targetName: 'TestDto',
    object: {},
    property,
  };
}

describe('IsIso4217CurrencyCodeConstraint', () => {
  const validator = new IsIso4217CurrencyCodeConstraint();

  describe('valid codes', () => {
    it.each(['USD', 'EUR', 'GBP', 'XLM', 'JPY', 'AUD', 'CAD'])(
      'accepts "%s"',
      (code) => {
        expect(validator.validate(code)).toBe(true);
      },
    );
  });

  describe('invalid codes', () => {
    it('rejects lowercase', () => {
      expect(validator.validate('usd')).toBe(false);
    });

    it('rejects mixed case', () => {
      expect(validator.validate('Usd')).toBe(false);
    });

    it('rejects codes shorter than 3 characters', () => {
      expect(validator.validate('US')).toBe(false);
    });

    it('rejects codes longer than 3 characters', () => {
      expect(validator.validate('USDT')).toBe(false);
    });

    it('rejects codes containing digits', () => {
      expect(validator.validate('U1D')).toBe(false);
    });

    it('rejects an empty string', () => {
      expect(validator.validate('')).toBe(false);
    });

    it('rejects non-string values', () => {
      expect(validator.validate(null)).toBe(false);
      expect(validator.validate(undefined)).toBe(false);
      expect(validator.validate(123)).toBe(false);
    });
  });

  it('error message names the property', () => {
    const msg = validator.defaultMessage(makeArgs('currency'));
    expect(msg).toContain('currency');
    expect(msg).toContain('ISO 4217');
  });
});
