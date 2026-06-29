import {
  IsValidPlatformConstraint,
  IsValidPlatformsConstraint,
} from './is-valid-platform.validator';

describe('IsValidPlatformConstraint', () => {
  const validator = new IsValidPlatformConstraint();

  it('accepts supported platforms (case-insensitive)', () => {
    expect(validator.validate('tiktok')).toBe(true);
    expect(validator.validate('YouTube-Shorts')).toBe(true);
  });

  it('rejects unknown platforms', () => {
    expect(validator.validate('myspace')).toBe(false);
  });

  it('rejects non-strings', () => {
    expect(validator.validate(123)).toBe(false);
    expect(validator.validate('')).toBe(false);
  });
});

describe('IsValidPlatformsConstraint', () => {
  const validator = new IsValidPlatformsConstraint();

  it('accepts an array of supported platforms', () => {
    expect(validator.validate(['tiktok', 'instagram'])).toBe(true);
  });

  it('rejects non-array values', () => {
    expect(validator.validate('tiktok')).toBe(false);
  });

  it('rejects arrays containing invalid platforms', () => {
    expect(validator.validate(['tiktok', 'invalid'])).toBe(false);
  });
});
