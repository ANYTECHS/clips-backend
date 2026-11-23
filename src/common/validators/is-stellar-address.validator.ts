import { StrKey } from '@stellar/stellar-sdk';
import { ValidateBy, ValidationOptions } from 'class-validator';

/**
 * Issue #1364 — reusable Stellar public wallet address validation.
 *
 * Public addresses are Ed25519 account IDs: 56 chars, `G` prefix, Base32 with
 * a valid CRC16 checksum. Secret seeds (`S...`) are explicitly rejected.
 * Error messages never echo the submitted value so secrets are not logged.
 */
export const STELLAR_ADDRESS_EXAMPLE =
  'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7';

export const STELLAR_ADDRESS_DESCRIPTION =
  'Stellar public address (G-prefix, Base32, 56 chars, valid checksum). Secret keys (S...) are rejected.';

export function isStellarSecretKey(value: unknown): boolean {
  return (
    typeof value === 'string' && StrKey.isValidEd25519SecretSeed(value.trim())
  );
}

export function isValidStellarPublicAddress(value: unknown): value is string {
  return typeof value === 'string' && StrKey.isValidEd25519PublicKey(value);
}

export function IsStellarAddress(
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  return ValidateBy(
    {
      name: 'isStellarAddress',
      validator: {
        validate: (value: unknown) => isValidStellarPublicAddress(value),
        defaultMessage: (args) =>
          isStellarSecretKey(args?.value)
            ? `${args?.property} must be a Stellar public address, not a secret key`
            : `${args?.property} must be a valid Stellar public address (G...)`,
      },
    },
    validationOptions,
  );
}
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
