import { ValidationArguments } from 'class-validator';
import { IsTotpCodeConstraint } from './is-totp-code.validator';

function makeArgs(property = 'totpCode'): ValidationArguments {
  return {
    value: undefined,
    constraints: [],
    targetName: 'TestDto',
    object: {},
    property,
  };
}

describe('IsTotpCodeConstraint', () => {
  const validator = new IsTotpCodeConstraint();

  describe('valid codes', () => {
    it.each(['000000', '123456', '999999', '012345'])(
      'accepts "%s"',
      (code) => {
        expect(validator.validate(code)).toBe(true);
      },
    );
  });

  describe('invalid codes', () => {
    it('rejects a 5-digit code (too short)', () => {
      expect(validator.validate('12345')).toBe(false);
    });

    it('rejects a 7-digit code (too long)', () => {
      expect(validator.validate('1234567')).toBe(false);
    });

    it('rejects a code containing letters', () => {
      expect(validator.validate('12345a')).toBe(false);
    });

    it('rejects a code with spaces', () => {
      expect(validator.validate('123 56')).toBe(false);
    });

    it('rejects an empty string', () => {
      expect(validator.validate('')).toBe(false);
    });

    it('rejects non-string values', () => {
      expect(validator.validate(123456)).toBe(false);
      expect(validator.validate(null)).toBe(false);
      expect(validator.validate(undefined)).toBe(false);
    });
  });

  it('provides a consistent error message', () => {
    const msg = validator.defaultMessage(makeArgs());
    expect(msg).toContain('6 digits');
  });
});
