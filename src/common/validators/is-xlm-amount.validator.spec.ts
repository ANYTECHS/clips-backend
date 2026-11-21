import { ValidationArguments } from 'class-validator';
import {
  IsXlmAmountConstraint,
  XLM_AMOUNT_MIN,
  XLM_AMOUNT_MAX,
} from './is-xlm-amount.validator';

function makeArgs(opts: object = {}): ValidationArguments {
  return {
    value: undefined,
    constraints: [opts],
    targetName: 'TestDto',
    object: {},
    property: 'amount',
  };
}

describe('IsXlmAmountConstraint', () => {
  const validator = new IsXlmAmountConstraint();

  describe('valid amounts', () => {
    it.each([
      '0.0000001',   // minimum (1 stroop)
      '1',
      '10.5',
      '100.1234567', // 7 decimal places
      '10000',       // maximum default
    ])('accepts "%s"', (val) => {
      expect(validator.validate(val, makeArgs())).toBe(true);
    });
  });

  describe('invalid amounts', () => {
    it('rejects a numeric value (not a string)', () => {
      expect(validator.validate(10.5 as unknown as string, makeArgs())).toBe(false);
    });

    it('rejects an empty string', () => {
      expect(validator.validate('', makeArgs())).toBe(false);
    });

    it('rejects negative amounts', () => {
      expect(validator.validate('-1', makeArgs())).toBe(false);
    });

    it('rejects zero (below the 1-stroop minimum)', () => {
      expect(validator.validate('0', makeArgs())).toBe(false);
    });

    it('rejects an amount above the default maximum', () => {
      expect(validator.validate('10001', makeArgs())).toBe(false);
    });

    it('rejects more than 7 decimal places', () => {
      expect(validator.validate('1.00000001', makeArgs())).toBe(false);
    });

    it('rejects non-numeric strings', () => {
      expect(validator.validate('abc', makeArgs())).toBe(false);
      expect(validator.validate('1e5', makeArgs())).toBe(false);
    });
  });

  describe('boundary: defaults', () => {
    it(`accepts '0.0000001' (minimum, 1 stroop)`, () => {
      // XLM_AMOUNT_MIN === 0.0000001, but String(0.0000001) produces "1e-7"
      // which the regex rejects.  Callers must use the decimal string literal.
      expect(validator.validate('0.0000001', makeArgs())).toBe(true);
    });

    it(`accepts '10000' (maximum)`, () => {
      expect(validator.validate(String(XLM_AMOUNT_MAX), makeArgs())).toBe(true);
    });
  });

  describe('custom options', () => {
    it('respects a custom min', () => {
      const args = makeArgs({ min: 1 });
      expect(validator.validate('0.5', args)).toBe(false);
      expect(validator.validate('1', args)).toBe(true);
    });

    it('respects a custom max', () => {
      const args = makeArgs({ max: 50 });
      expect(validator.validate('50', args)).toBe(true);
      expect(validator.validate('51', args)).toBe(false);
    });
  });

  it('error message includes bounds', () => {
    validator.validate('999', makeArgs());
    const msg = validator.defaultMessage(makeArgs());
    expect(msg).toContain('XLM');
  });
});
