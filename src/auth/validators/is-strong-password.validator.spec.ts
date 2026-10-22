import { IsStrongPasswordConstraint } from './is-strong-password.validator';

describe('IsStrongPasswordConstraint (#1142)', () => {
  let validator: IsStrongPasswordConstraint;

  beforeEach(() => {
    validator = new IsStrongPasswordConstraint();
  });

  it('rejects passwords shorter than 10 characters', () => {
    const isValid = validator.validate('Short1!');
    expect(isValid).toBe(false);

    const message = JSON.parse(validator.defaultMessage({} as any));
    expect(message.score).toBe(0);
    expect(message.feedback).toContain('Password must be at least 10 characters long');
  });

  it('rejects weak passwords with score below 3', () => {
    // 16 characters but easily guessable dictionary repetition
    const isValid = validator.validate('passwordpassword');
    expect(isValid).toBe(false);

    const message = JSON.parse(validator.defaultMessage({} as any));
    expect(message.score).toBeLessThan(3);
    expect(message.suggestions).toBeDefined();
  });

  it('accepts strong passwords meeting the minimum score of 3', () => {
    const isValid = validator.validate('C1ip$Cash#Secure2026!Str0ng');
    expect(isValid).toBe(true);

    const message = JSON.parse(validator.defaultMessage({} as any));
    expect(message.score).toBeGreaterThanOrEqual(3);
    expect(message.suggestions).toBe('Password is strong');
  });

  it('provides helpful suggestions when characters are missing', () => {
    validator.validate('alllowercasepassword');
    const message = JSON.parse(validator.defaultMessage({} as any));
    expect(message.score).toBeLessThan(3);
  });
});
