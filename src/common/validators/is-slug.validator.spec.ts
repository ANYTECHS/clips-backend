import { ValidationArguments } from 'class-validator';
import { IsSlugConstraint } from './is-slug.validator';

function makeArgs(property = 'collectionId'): ValidationArguments {
  return {
    value: undefined,
    constraints: [],
    targetName: 'TestDto',
    object: {},
    property,
  };
}

describe('IsSlugConstraint', () => {
  const validator = new IsSlugConstraint();

  describe('valid slugs', () => {
    it.each([
      'viral-clips',
      'my-collection-2',
      'nfts',
      'a',
      '123',
      'abc123',
      'one-two-three',
    ])('accepts "%s"', (slug) => {
      expect(validator.validate(slug)).toBe(true);
    });
  });

  describe('invalid slugs', () => {
    it.each([
      ['uppercase letters', 'Viral-Clips'],
      ['leading hyphen', '-clip'],
      ['trailing hyphen', 'clip-'],
      ['consecutive hyphens', 'clip--two'],
      ['underscore', 'clip_name'],
      ['space', 'clip name'],
      ['slash', 'clips/nfts'],
      ['empty string', ''],
    ])('rejects %s ("%s")', (_label, slug) => {
      expect(validator.validate(slug)).toBe(false);
    });
  });

  it('rejects non-string values', () => {
    expect(validator.validate(null)).toBe(false);
    expect(validator.validate(undefined)).toBe(false);
    expect(validator.validate(42)).toBe(false);
    expect(validator.validate([])).toBe(false);
  });

  it('provides a message that names the property', () => {
    const msg = validator.defaultMessage(makeArgs('collectionId'));
    expect(msg).toContain('collectionId');
    expect(msg).toContain('slug');
  });
});
