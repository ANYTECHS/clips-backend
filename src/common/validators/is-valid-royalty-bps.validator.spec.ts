import { ValidationArguments } from 'class-validator';
import { IsValidRoyaltyBpsConstraint } from './is-valid-royalty-bps.validator';

function makeArgs(constraints: unknown[] = [{}]): ValidationArguments {
  return {
    value: undefined,
    constraints,
    targetName: 'TestDto',
    object: {},
    property: 'royaltyBps',
  };
}

describe('IsValidRoyaltyBpsConstraint', () => {
  const validator = new IsValidRoyaltyBpsConstraint();

  it('allows undefined (optional field)', () => {
    expect(validator.validate(undefined, makeArgs())).toBe(true);
  });

  it('accepts 0 through 10000 by default', () => {
    expect(validator.validate(0, makeArgs())).toBe(true);
    expect(validator.validate(10000, makeArgs())).toBe(true);
    expect(validator.validate(1000, makeArgs())).toBe(true);
  });

  it('rejects values below 0 or above max', () => {
    expect(validator.validate(-1, makeArgs())).toBe(false);
    expect(validator.validate(10001, makeArgs())).toBe(false);
  });

  it('rejects non-integers', () => {
    expect(validator.validate(10.5, makeArgs())).toBe(false);
    expect(validator.validate('1000', makeArgs())).toBe(false);
  });

  it('respects custom max via constraints', () => {
    const args = makeArgs([{ max: 1500 }]);
    expect(validator.validate(1500, args)).toBe(true);
    expect(validator.validate(1501, args)).toBe(false);
  });
});
