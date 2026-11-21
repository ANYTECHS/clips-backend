import {
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';

export interface PasswordOptions {
  /**
   * Minimum number of characters.  Defaults to 8.
   */
  minLength?: number;
  /**
   * Maximum number of characters.  Defaults to 128 (safe upper bound to
   * prevent DoS via bcrypt with extremely long inputs).
   */
  maxLength?: number;
}

/**
 * Validates that a value is a string that meets the minimum and maximum length
 * requirements for a password field.
 *
 * This decorator covers *syntactic* requirements (is it a non-empty string of
 * the right length?).  Semantic strength requirements (entropy, zxcvbn score)
 * are handled separately by `@IsStrongPassword()` which lives in
 * `src/auth/validators`.
 *
 * Usage — apply the `@IsPassword()` decorator from `decorators.ts` instead of
 * instantiating this class directly.
 */
@ValidatorConstraint({ name: 'isPassword', async: false })
export class IsPasswordConstraint implements ValidatorConstraintInterface {
  private readonly DEFAULT_MIN = 8;
  private readonly DEFAULT_MAX = 128;

  private resolvedMin = this.DEFAULT_MIN;
  private resolvedMax = this.DEFAULT_MAX;

  validate(value: unknown, args: ValidationArguments): boolean {
    const opts = (args.constraints[0] ?? {}) as PasswordOptions;
    this.resolvedMin = opts.minLength ?? this.DEFAULT_MIN;
    this.resolvedMax = opts.maxLength ?? this.DEFAULT_MAX;

    if (typeof value !== 'string') return false;
    return value.length >= this.resolvedMin && value.length <= this.resolvedMax;
  }

  defaultMessage(_args: ValidationArguments): string {
    return `Password must be a string between ${this.resolvedMin} and ${this.resolvedMax} characters`;
  }
}
