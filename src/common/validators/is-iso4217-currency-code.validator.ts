import {
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';

/**
 * Validates that a value is an ISO 4217 currency code: exactly 3 uppercase
 * ASCII letters (A–Z).
 *
 * This is a lightweight structural check; it does not consult a list of
 * officially recognised codes, so non-existent codes like "ZZZ" pass.  For
 * a stricter check use an allowlist or extend this constraint.
 *
 * Valid examples: `USD`, `XLM`, `EUR`, `GBP`
 * Invalid examples: `usd`, `US`, `USDT`, `1USD`
 *
 * Usage — apply the `@IsIso4217CurrencyCode()` decorator from `decorators.ts`
 * instead of instantiating this class directly.
 */
@ValidatorConstraint({ name: 'isIso4217CurrencyCode', async: false })
export class IsIso4217CurrencyCodeConstraint
  implements ValidatorConstraintInterface
{
  private static readonly CURRENCY_REGEX = /^[A-Z]{3}$/;

  validate(value: unknown): boolean {
    if (typeof value !== 'string') return false;
    return IsIso4217CurrencyCodeConstraint.CURRENCY_REGEX.test(value);
  }

  defaultMessage(args: ValidationArguments): string {
    return `${args.property} must be a 3-letter ISO 4217 currency code (e.g. USD, XLM, EUR)`;
  }
}
