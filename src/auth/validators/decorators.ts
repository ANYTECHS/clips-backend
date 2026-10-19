import { ValidateBy, ValidationOptions } from 'class-validator';
import { IsStrongPasswordConstraint } from './is-strong-password.validator';

/**
 * Checks if the string is a strong password based on zxcvbn analysis.
 * Requires:
 * - Minimum length of 10 characters
 * - Score of at least 3 (on 0-4 scale from zxcvbn)
 * - Provides helpful feedback about what's missing
 */
export function IsStrongPassword(
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  return ValidateBy(
    {
      name: 'isStrongPassword',
      constraints: [],
      validator: new IsStrongPasswordConstraint(),
    },
    validationOptions,
  );
}
