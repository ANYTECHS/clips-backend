import {
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';
import { STELLAR_PUBLIC_KEY_REGEX } from '@clipcash/shared';

/**
 * Validates that a value is a valid Stellar public key: a 56-character
 * Base32-encoded string starting with the uppercase letter G.
 *
 * The regex used (`STELLAR_PUBLIC_KEY_REGEX`) is sourced from
 * `@clipcash/shared` so the canonical format stays in one place.
 *
 * Usage — apply the `@IsStellarAddress()` decorator from `decorators.ts`
 * instead of instantiating this class directly.
 */
@ValidatorConstraint({ name: 'isStellarAddress', async: false })
export class IsStellarAddressConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== 'string' || value.length === 0) {
      return false;
    }
    return STELLAR_PUBLIC_KEY_REGEX.test(value);
  }

  defaultMessage(args: ValidationArguments): string {
    return `${args.property} must be a valid Stellar public key (G-prefix, Base32, 56 characters)`;
  }
}
