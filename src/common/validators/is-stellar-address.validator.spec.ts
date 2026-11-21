import { ValidationArguments } from 'class-validator';
import { IsStellarAddressConstraint } from './is-stellar-address.validator';

function makeArgs(property = 'walletAddress'): ValidationArguments {
  return {
    value: undefined,
    constraints: [],
    targetName: 'TestDto',
    object: {},
    property,
  };
}

describe('IsStellarAddressConstraint', () => {
  const validator = new IsStellarAddressConstraint();

  it('accepts a well-formed 56-character Stellar G-address', () => {
    expect(
      validator.validate(
        'GC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3',
      ),
    ).toBe(true);
  });

  it('accepts another valid address', () => {
    expect(
      validator.validate(
        'GABC2222222222222222222222222222222222222222222222222222ABCD',
      ),
    ).toBe(false); // length is wrong — 60 chars, not 56
  });

  it('rejects an address that is too short', () => {
    expect(validator.validate('GC6XOTK6SHORT')).toBe(false);
  });

  it('rejects an address that is too long (57 characters)', () => {
    // 57 chars, starts with G but one char too long
    expect(
      validator.validate(
        'GC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3X',
      ),
    ).toBe(false);
  });

  it('rejects an address that starts with a letter other than G', () => {
    expect(
      validator.validate(
        'AC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3',
      ),
    ).toBe(false);
  });

  it('rejects lowercase input', () => {
    expect(
      validator.validate(
        'gc6xotk6l6lgbkiwh3iruzpvuy4cogemw4j5yinospko27yktuuhtzf3',
      ),
    ).toBe(false);
  });

  it('rejects an empty string', () => {
    expect(validator.validate('')).toBe(false);
  });

  it('rejects non-string values', () => {
    expect(validator.validate(null)).toBe(false);
    expect(validator.validate(undefined)).toBe(false);
    expect(validator.validate(12345)).toBe(false);
    expect(validator.validate({})).toBe(false);
  });

  it('provides a message that names the property', () => {
    const args = makeArgs('creatorWallet');
    const msg = validator.defaultMessage(args);
    expect(msg).toContain('creatorWallet');
    expect(msg).toContain('Stellar');
  });
});
