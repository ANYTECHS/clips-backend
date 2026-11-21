import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { IsStellarTransactionHash } from './decorators';
import {
  IsStellarTransactionHashConstraint,
  STELLAR_TX_HASH_REGEX,
} from './is-stellar-transaction-hash.validator';

// ---------------------------------------------------------------------------
// Helper DTO used throughout the tests
// ---------------------------------------------------------------------------
class TestDto {
  @IsStellarTransactionHash()
  transactionHash: string;
}

async function validateHash(value: unknown): Promise<string[]> {
  const instance = plainToInstance(TestDto, { transactionHash: value });
  const errors = await validate(instance as object);
  return errors.flatMap((e) => Object.values(e.constraints ?? {}));
}

// ---------------------------------------------------------------------------
// STELLAR_TX_HASH_REGEX
// ---------------------------------------------------------------------------
describe('STELLAR_TX_HASH_REGEX', () => {
  it('matches a valid 64-character lowercase hex string', () => {
    expect(
      STELLAR_TX_HASH_REGEX.test(
        'a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456',
      ),
    ).toBe(true);
  });

  it('matches a string of 64 zeros (all digits)', () => {
    expect(STELLAR_TX_HASH_REGEX.test('0'.repeat(64))).toBe(true);
  });

  it('matches a string of 64 lowercase hex letters', () => {
    expect(STELLAR_TX_HASH_REGEX.test('abcdef'.repeat(10) + 'abcd')).toBe(true);
  });

  it('rejects a string shorter than 64 characters', () => {
    expect(STELLAR_TX_HASH_REGEX.test('a'.repeat(63))).toBe(false);
  });

  it('rejects a string longer than 64 characters', () => {
    expect(STELLAR_TX_HASH_REGEX.test('a'.repeat(65))).toBe(false);
  });

  it('rejects uppercase hex characters', () => {
    expect(
      STELLAR_TX_HASH_REGEX.test(
        'A1B2C3D4E5F6789012345678901234567890ABCDEF1234567890ABCDEF123456',
      ),
    ).toBe(false);
  });

  it('rejects a mixed-case hash', () => {
    expect(
      STELLAR_TX_HASH_REGEX.test(
        'A1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456',
      ),
    ).toBe(false);
  });

  it('rejects non-hex characters', () => {
    expect(
      STELLAR_TX_HASH_REGEX.test(
        'z1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456',
      ),
    ).toBe(false);
  });

  it('rejects an empty string', () => {
    expect(STELLAR_TX_HASH_REGEX.test('')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// IsStellarTransactionHashConstraint — raw constraint
// ---------------------------------------------------------------------------
describe('IsStellarTransactionHashConstraint', () => {
  const constraint = new IsStellarTransactionHashConstraint();
  const fakeArgs = { value: '' } as any;

  it('returns true for a valid hash', () => {
    expect(
      constraint.validate(
        'a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456',
      ),
    ).toBe(true);
  });

  it('returns false for an empty string', () => {
    expect(constraint.validate('')).toBe(false);
  });

  it('returns false for a non-string value', () => {
    expect(constraint.validate(null)).toBe(false);
    expect(constraint.validate(undefined)).toBe(false);
    expect(constraint.validate(12345)).toBe(false);
  });

  it('provides an empty-string message when value is empty', () => {
    fakeArgs.value = '';
    const msg = constraint.defaultMessage(fakeArgs);
    expect(msg).toMatch(/empty/i);
  });

  it('provides a format message for a non-empty invalid value', () => {
    fakeArgs.value = 'INVALID';
    const msg = constraint.defaultMessage(fakeArgs);
    expect(msg).toMatch(/64/);
    expect(msg).toMatch(/hex/i);
  });
});

// ---------------------------------------------------------------------------
// @IsStellarTransactionHash decorator via class-validator
// ---------------------------------------------------------------------------
describe('@IsStellarTransactionHash decorator', () => {
  it('passes for a valid 64-character lowercase hex hash', async () => {
    const errs = await validateHash(
      'a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456',
    );
    expect(errs).toHaveLength(0);
  });

  it('passes for a hash composed entirely of digits', async () => {
    const errs = await validateHash('1'.repeat(64));
    expect(errs).toHaveLength(0);
  });

  it('rejects an empty string', async () => {
    const errs = await validateHash('');
    expect(errs.length).toBeGreaterThan(0);
    expect(errs.some((e) => /empty/i.test(e))).toBe(true);
  });

  it('rejects undefined / missing value', async () => {
    const errs = await validateHash(undefined);
    expect(errs.length).toBeGreaterThan(0);
  });

  it('rejects a 63-character string (too short)', async () => {
    const errs = await validateHash('a'.repeat(63));
    expect(errs.length).toBeGreaterThan(0);
  });

  it('rejects a 65-character string (too long)', async () => {
    const errs = await validateHash('a'.repeat(65));
    expect(errs.length).toBeGreaterThan(0);
  });

  it('rejects uppercase hex characters', async () => {
    const errs = await validateHash(
      'A1B2C3D4E5F6789012345678901234567890ABCDEF1234567890ABCDEF123456',
    );
    expect(errs.length).toBeGreaterThan(0);
  });

  it('rejects a hash with non-hex characters', async () => {
    // Replace first char with 'z'
    const errs = await validateHash(
      'z1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456',
    );
    expect(errs.length).toBeGreaterThan(0);
  });

  it('rejects a numeric value (non-string)', async () => {
    const errs = await validateHash(123456);
    expect(errs.length).toBeGreaterThan(0);
  });

  it('error message mentions the expected format for a malformed hash', async () => {
    const errs = await validateHash('not-a-hash');
    expect(errs.some((e) => /64/i.test(e) || /hex/i.test(e))).toBe(true);
  });
});
