import { ValidationArguments } from 'class-validator';
import { IsUserEmailConstraint } from './is-user-email.validator';

function makeArgs(property = 'email'): ValidationArguments {
  return {
    value: undefined,
    constraints: [],
    targetName: 'TestDto',
    object: {},
    property,
  };
}

describe('IsUserEmailConstraint', () => {
  const validator = new IsUserEmailConstraint();

  describe('valid email addresses', () => {
    it.each([
      'user@example.com',
      'john.doe@domain.org',
      'alice+tag@sub.domain.co.uk',
      'test123@test.io',
    ])('accepts "%s"', (email) => {
      expect(validator.validate(email)).toBe(true);
    });
  });

  describe('invalid email addresses', () => {
    it('rejects a string without @', () => {
      expect(validator.validate('notanemail')).toBe(false);
    });

    it('rejects a string without a domain', () => {
      expect(validator.validate('user@')).toBe(false);
    });

    it('rejects a string without a TLD segment', () => {
      expect(validator.validate('user@domain')).toBe(false);
    });

    it('rejects a string with spaces', () => {
      expect(validator.validate('user @example.com')).toBe(false);
    });

    it('rejects an empty string', () => {
      expect(validator.validate('')).toBe(false);
    });

    it('rejects non-string values', () => {
      expect(validator.validate(null)).toBe(false);
      expect(validator.validate(undefined)).toBe(false);
      expect(validator.validate(42)).toBe(false);
    });
  });

  it('provides a consistent error message', () => {
    const msg = validator.defaultMessage(makeArgs());
    expect(msg).toBe('Please provide a valid email address');
  });
});
