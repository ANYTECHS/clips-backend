import { ValidationArguments } from 'class-validator';
import { IsUniqueArrayConstraint } from './is-unique-array.validator';

function makeArgs(property = 'items'): ValidationArguments {
  return {
    value: undefined,
    constraints: [],
    targetName: 'TestDto',
    object: {},
    property,
  };
}

describe('IsUniqueArrayConstraint', () => {
  const validator = new IsUniqueArrayConstraint();

  describe('validate', () => {
    it('accepts an empty array', () => {
      expect(validator.validate([])).toBe(true);
    });

    it('accepts an array of unique primitives', () => {
      expect(validator.validate([1, 2, 3])).toBe(true);
      expect(validator.validate(['a', 'b', 'c'])).toBe(true);
    });

    it('rejects an array of duplicate integers', () => {
      expect(validator.validate([1, 2, 1])).toBe(false);
    });

    it('rejects an array of duplicate strings', () => {
      expect(validator.validate(['foo', 'bar', 'foo'])).toBe(false);
    });

    it('accepts an array of unique plain objects', () => {
      expect(validator.validate([{ id: 1 }, { id: 2 }])).toBe(true);
    });

    it('rejects an array of duplicate plain objects (deep equality via JSON)', () => {
      expect(validator.validate([{ id: 1 }, { id: 1 }])).toBe(false);
    });

    it('passes through non-array values without raising (lets @IsArray handle them)', () => {
      expect(validator.validate('not-an-array')).toBe(true);
      expect(validator.validate(null)).toBe(true);
      expect(validator.validate(undefined)).toBe(true);
      expect(validator.validate(42)).toBe(true);
    });
  });

  describe('defaultMessage', () => {
    it('names the property in the message', () => {
      const msg = validator.defaultMessage(makeArgs('tagIds'));
      expect(msg).toBe('tagIds must not contain duplicate values');
    });
  });
});
