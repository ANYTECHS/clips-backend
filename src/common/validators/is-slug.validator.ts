import {
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';

/**
 * Validates that a value is a URL-safe lowercase slug — only lowercase letters,
 * digits and single hyphens between segments.  Leading, trailing, or consecutive
 * hyphens are rejected.
 *
 * Valid examples: `viral-clips`, `my-collection-2`, `nfts`
 * Invalid examples: `Viral-Clips`, `-clip`, `clip--two`, `clip_name`
 *
 * Usage — apply the `@IsSlug()` decorator from `decorators.ts` instead of
 * instantiating this class directly.
 */
@ValidatorConstraint({ name: 'isSlug', async: false })
export class IsSlugConstraint implements ValidatorConstraintInterface {
  /**
   * Matches a non-empty slug where each segment is `[a-z0-9]+` and
   * segments are joined by exactly one `-`.
   */
  static readonly SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

  validate(value: unknown): boolean {
    if (typeof value !== 'string' || value.length === 0) {
      return false;
    }
    return IsSlugConstraint.SLUG_REGEX.test(value);
  }

  defaultMessage(args: ValidationArguments): string {
    return `${args.property} must be a lowercase slug (letters, digits and single hyphens), e.g. viral-clips`;
  }
}
