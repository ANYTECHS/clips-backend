import {
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';

/**
 * Validates that a value is a well-formed email address.
 *
 * Uses the same rules as class-validator's built-in `@IsEmail()`, but provides
 * a single consistent error message across every DTO that accepts a user email.
 *
 * Usage — apply the `@IsUserEmail()` decorator from `decorators.ts` instead of
 * instantiating this class directly.
 */
@ValidatorConstraint({ name: 'isUserEmail', async: false })
export class IsUserEmailConstraint implements ValidatorConstraintInterface {
  /**
   * Very permissive email regex that covers all practical addresses while
   * rejecting obvious non-emails.  It intentionally stays close to RFC 5322
   * without implementing the full (unpractical) grammar.
   */
  private static readonly EMAIL_REGEX =
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  validate(value: unknown): boolean {
    if (typeof value !== 'string' || value.length === 0) {
      return false;
    }
    return IsUserEmailConstraint.EMAIL_REGEX.test(value);
  }

  defaultMessage(_args: ValidationArguments): string {
    return 'Please provide a valid email address';
  }
}
