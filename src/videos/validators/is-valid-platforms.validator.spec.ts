import {
  IsValidPlatformsConstraint,
  SUPPORTED_PLATFORMS,
} from './is-valid-platforms.validator';

describe('IsValidPlatformsConstraint', () => {
  let validator: IsValidPlatformsConstraint;

  beforeEach(() => {
    validator = new IsValidPlatformsConstraint();
  });

  describe('validate', () => {
    it('should return true for valid platforms array', () => {
      expect(validator.validate(['tiktok', 'instagram'])).toBe(true);
      expect(validator.validate(['youtube-shorts'])).toBe(true);
      expect(validator.validate(['tiktok', 'instagram', 'youtube-shorts'])).toBe(true);
    });

    it('should return true for valid platforms with mixed case (normalized)', () => {
      expect(validator.validate(['TikTok', 'Instagram'])).toBe(true);
      expect(validator.validate(['YOUTUBE-SHORTS'])).toBe(true);
      expect(validator.validate(['TikTok', 'tiktok'])).toBe(true);
    });

    it('should return true for empty array', () => {
      expect(validator.validate([])).toBe(true);
    });

    it('should return false for non-array values', () => {
      expect(validator.validate('tiktok')).toBe(false);
      expect(validator.validate(null)).toBe(false);
      expect(validator.validate(undefined)).toBe(false);
      expect(validator.validate({})).toBe(false);
      expect(validator.validate(123)).toBe(false);
    });

    it('should return false for array with invalid platform', () => {
      expect(validator.validate(['tiktok', 'invalid-platform'])).toBe(false);
      expect(validator.validate(['reddit'])).toBe(false);
      // linkedin is now a supported platform (Issue #856 — sync with ConfigService)
      expect(validator.validate(['tiktok', 'instagram', 'linkedin'])).toBe(
        true,
      );
    });

    it('should return false for array with non-string values', () => {
      expect(validator.validate([123])).toBe(false);
      expect(validator.validate(['tiktok', null])).toBe(false);
      expect(validator.validate(['tiktok', undefined])).toBe(false);
      expect(validator.validate([{}])).toBe(false);
    });

    it('should return false for array with mixed valid and invalid platforms', () => {
      expect(validator.validate(['tiktok', 'invalid'])).toBe(false);
    });
  });

  describe('defaultMessage', () => {
    it('should return appropriate message for non-array', () => {
      validator.validate('not-an-array');
      const message = validator.defaultMessage({
        value: 'not-an-array',
      } as any);
      expect(message).toBe('targetPlatforms must be an array');
    });

    it('should return appropriate message for non-string values', () => {
      validator.validate([123]);
      const message = validator.defaultMessage({ value: [123] } as any);
      expect(message).toBe('All platform values must be strings');
    });

    it('should list invalid platforms', () => {
      const invalidValue = ['tiktok', 'invalid-platform', 'another-invalid'];
      validator.validate(invalidValue);
      const message = validator.defaultMessage({ value: invalidValue } as any);
      expect(message).toContain(
        'Invalid platform(s): invalid-platform, another-invalid',
      );
      expect(message).toContain('Supported platforms:');
    });

    it('should include all supported platforms in error message', () => {
      validator.validate(['invalid']);
      const message = validator.defaultMessage({ value: ['invalid'] } as any);
      SUPPORTED_PLATFORMS.forEach((platform) => {
        expect(message).toContain(platform);
      });
    });
  });
});
