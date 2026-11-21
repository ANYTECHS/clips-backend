import {
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Canonical list of accepted currency codes.
 *
 * Issue #1371 — centralise currency validation.
 *
 * These values mirror `SupportedCurrency` in `CurrencyService`. This file
 * keeps a static copy so that class-validator decorators (which cannot inject
 * services) remain synchronous and dependency-free. When adding a new
 * currency, update BOTH this constant AND `SupportedCurrency` in
 * `src/common/services/currency.service.ts`.
 *
 * Values are uppercase ISO 4217 codes (or crypto equivalents: XLM, USDC).
 */
export const SUPPORTED_CURRENCY_CODES = ['USD', 'EUR', 'GBP', 'XLM', 'USDC'] as const;

export type SupportedCurrencyCode = (typeof SUPPORTED_CURRENCY_CODES)[number];

/**
 * Normalise an arbitrary string to the canonical uppercase form used in
 * `SUPPORTED_CURRENCY_CODES`.
 */
export function normalizeCurrencyCode(code: string): string {
  return code.trim().toUpperCase();
}

/**
 * Returns true when `code` is an accepted currency after normalisation.
 */
export function isSupportedCurrencyCode(code: string): code is SupportedCurrencyCode {
  return SUPPORTED_CURRENCY_CODES.includes(
    normalizeCurrencyCode(code) as SupportedCurrencyCode,
  );
}

@ValidatorConstraint({ name: 'isSupportedCurrency', async: false })
export class IsSupportedCurrencyConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== 'string' || value.trim().length === 0) {
      return false;
    }
    return isSupportedCurrencyCode(value);
  }

  defaultMessage(args: ValidationArguments): string {
    const value = args.value;
    if (typeof value !== 'string') {
      return 'currency must be a string';
    }
    return (
      `Unsupported currency: "${value.trim()}". ` +
      `Supported currencies: ${SUPPORTED_CURRENCY_CODES.join(', ')}`
    );
  }
}

/**
 * Convenience re-export for use in Swagger `@ApiProperty` decorators.
 *
 * @example
 * \@ApiProperty({ enum: CURRENCY_ENUM, example: 'USD' })
 * currency: string;
 */
export const CURRENCY_ENUM = SUPPORTED_CURRENCY_CODES;

/**
 * Pre-built `@ApiProperty` options for a required currency field.
 *
 * @example
 * \@ApiProperty(CURRENCY_API_PROPERTY)
 * currency: string;
 */
export const CURRENCY_API_PROPERTY: Parameters<typeof ApiProperty>[0] = {
  enum: SUPPORTED_CURRENCY_CODES,
  example: 'USD',
  description:
    `ISO 4217 currency code. Supported values: ${SUPPORTED_CURRENCY_CODES.join(', ')}.`,
};

/**
 * Pre-built `@ApiPropertyOptional` options for an optional currency field.
 */
export const CURRENCY_API_PROPERTY_OPTIONAL: Parameters<typeof ApiProperty>[0] = {
  ...CURRENCY_API_PROPERTY,
  required: false,
};
