import { ValidationArguments } from 'class-validator';
import {
  IsValidPlanConstraint,
  SUBSCRIPTION_PLANS,
  normalizePlanIdentifier,
  isValidPlan,
} from './is-valid-plan.validator';

function makeArgs(value: unknown): ValidationArguments {
  return {
    value,
    constraints: [],
    targetName: 'TestDto',
    object: {},
    property: 'plan',
  };
}

describe('normalizePlanIdentifier', () => {
  it('lowercases and trims the input', () => {
    expect(normalizePlanIdentifier('  PRO  ')).toBe('pro');
    expect(normalizePlanIdentifier('Basic')).toBe('basic');
    expect(normalizePlanIdentifier('ELITE')).toBe('elite');
  });
});

describe('isValidPlan', () => {
  it('accepts every plan in SUBSCRIPTION_PLANS', () => {
    for (const plan of SUBSCRIPTION_PLANS) {
      expect(isValidPlan(plan)).toBe(true);
    }
  });

  it('accepts uppercase and mixed-case variants', () => {
    expect(isValidPlan('PRO')).toBe(true);
    expect(isValidPlan('Basic')).toBe(true);
    expect(isValidPlan('ELITE')).toBe(true);
    expect(isValidPlan('Agency')).toBe(true);
  });

  it('rejects unsupported plan identifiers', () => {
    expect(isValidPlan('enterprise')).toBe(false);
    expect(isValidPlan('starter')).toBe(false);
    expect(isValidPlan('free')).toBe(false);
    expect(isValidPlan('')).toBe(false);
  });
});

describe('IsValidPlanConstraint', () => {
  const validator = new IsValidPlanConstraint();

  describe('validate()', () => {
    it('accepts supported plans (case-insensitive)', () => {
      expect(validator.validate('basic')).toBe(true);
      expect(validator.validate('pro')).toBe(true);
      expect(validator.validate('elite')).toBe(true);
      expect(validator.validate('agency')).toBe(true);
    });

    it('accepts uppercase and mixed-case plan names', () => {
      expect(validator.validate('PRO')).toBe(true);
      expect(validator.validate('Basic')).toBe(true);
      expect(validator.validate('ELITE')).toBe(true);
    });

    it('accepts values with surrounding whitespace after normalisation', () => {
      expect(validator.validate('  pro  ')).toBe(true);
    });

    it('rejects unsupported plan identifiers', () => {
      expect(validator.validate('enterprise')).toBe(false);
      expect(validator.validate('starter')).toBe(false);
      expect(validator.validate('free')).toBe(false);
      expect(validator.validate('premium')).toBe(false);
    });

    it('rejects non-string values', () => {
      expect(validator.validate(123)).toBe(false);
      expect(validator.validate(null)).toBe(false);
      expect(validator.validate(undefined)).toBe(false);
      expect(validator.validate({})).toBe(false);
      expect(validator.validate(['pro'])).toBe(false);
    });

    it('rejects empty and blank strings', () => {
      expect(validator.validate('')).toBe(false);
      expect(validator.validate('   ')).toBe(false);
    });
  });

  describe('defaultMessage()', () => {
    it('names the unsupported plan and lists accepted plans', () => {
      const msg = validator.defaultMessage(makeArgs('enterprise'));
      expect(msg).toContain('enterprise');
      for (const plan of SUBSCRIPTION_PLANS) {
        expect(msg).toContain(plan);
      }
    });

    it('returns a type error message for non-strings', () => {
      const msg = validator.defaultMessage(makeArgs(99));
      expect(msg).toMatch(/must be a string/);
    });
  });
});
