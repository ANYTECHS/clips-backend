import {
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';

/**
 * Validates that a value is a valid Time-based One-Time Password (TOTP) code:
 * exactly 6 ASCII digits (0–9), as produced by authenticator apps that follow
 * RFC 6238.
 *
 * Usage — apply the `@IsTotpCode()` decorator from `decorators.ts` instead of
 * instantiating this class directly.
 */
@ValidatorConstraint({ name: 'isTotpCode', async: false })
export class IsTotpCodeConstraint implements ValidatorConstraintInterface {
  private static readonly TOTP_REGEX = /^\d{6}$/;

  validate(value: unknown): boolean {
    if (typeof value !== 'string') {
      return false;
    }
    return IsTotpCodeConstraint.TOTP_REGEX.test(value);
  }

  defaultMessage(_args: ValidationArguments): string {
    return 'TOTP code must be exactly 6 digits (0–9)';
  }
}
