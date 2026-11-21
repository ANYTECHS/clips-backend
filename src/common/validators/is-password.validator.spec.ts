import { ValidationArguments } from 'class-validator';
import { IsPasswordConstraint } from './is-password.validator';

function makeArgs(opts: object = {}): ValidationArguments {
  return {
    value: undefined,
    constraints: [opts],
    targetName: 'TestDto',
    object: {},
    property: 'password',
  };
}

describe('IsPasswordConstraint', () => {
  const validator = new IsPasswordConstraint();

  describe('default bounds (8–128 characters)', () => {
    it('accepts an 8-character password', () => {
      expect(validator.validate('12345678', makeArgs())).toBe(true);
    });

    it('accepts a 128-character password', () => {
      expect(validator.validate('a'.repeat(128), makeArgs())).toBe(true);
    });

    it('rejects a 7-character password (below minimum)', () => {
      expect(validator.validate('1234567', makeArgs())).toBe(false);
    });

    it('rejects a 129-character password (above maximum)', () => {
      expect(validator.validate('a'.repeat(129), makeArgs())).toBe(false);
    });
  });

  describe('custom bounds', () => {
    it('respects a custom minLength', () => {
      const args = makeArgs({ minLength: 10 });
      expect(validator.validate('123456789', args)).toBe(false);  // 9 chars
      expect(validator.validate('1234567890', args)).toBe(true);  // 10 chars
    });

    it('respects a custom maxLength', () => {
      const args = makeArgs({ maxLength: 32 });
      expect(validator.validate('a'.repeat(32), args)).toBe(true);
      expect(validator.validate('a'.repeat(33), args)).toBe(false);
    });
  });

  it('rejects non-string values', () => {
    expect(validator.validate(null, makeArgs())).toBe(false);
    expect(validator.validate(undefined, makeArgs())).toBe(false);
    expect(validator.validate(12345678, makeArgs())).toBe(false);
  });

  it('error message includes bounds', () => {
    validator.validate('x', makeArgs());
    const msg = validator.defaultMessage(makeArgs());
    expect(msg).toContain('8');
    expect(msg).toContain('128');
  });
});
