import { ValidateBy, ValidationOptions } from 'class-validator';
import {
  IsValidPlatformConstraint,
  IsValidPlatformsConstraint,
} from './is-valid-platform.validator';
import {
  IsValidRoyaltyBpsConstraint,
  RoyaltyBpsValidationOptions,
  CLIP_ROYALTY_BPS_MAX,
} from './is-valid-royalty-bps.validator';
import {
  IsStellarTransactionHashConstraint,
  STELLAR_TX_HASH_REGEX,
} from './is-stellar-transaction-hash.validator';

export { CLIP_ROYALTY_BPS_MAX, STELLAR_TX_HASH_REGEX };
import { IsStellarAddressConstraint } from './is-stellar-address.validator';
import { IsSlugConstraint } from './is-slug.validator';
import { IsXlmAmountConstraint, XlmAmountOptions } from './is-xlm-amount.validator';
import { IsIso4217CurrencyCodeConstraint } from './is-iso4217-currency-code.validator';
import { IsUserEmailConstraint } from './is-user-email.validator';
import { IsPasswordConstraint, PasswordOptions } from './is-password.validator';
import { IsTotpCodeConstraint } from './is-totp-code.validator';
import { IsSupportedCurrencyConstraint } from './is-supported-currency.validator';
import { IsValidPlanConstraint } from './is-valid-plan.validator';

export { CLIP_ROYALTY_BPS_MAX };
export { IsStellarAddress } from './is-stellar-address.validator';
export { IsValidSchedule } from './is-valid-schedule.validator';
export type { RoyaltyBpsValidationOptions, XlmAmountOptions, PasswordOptions };

// ---------------------------------------------------------------------------
// Pre-existing decorators
// ---------------------------------------------------------------------------

// Array validation factories and standalone duplicate-rejection decorator.
export {
  IsIdArray,
  IsStringArray,
  IsNestedArray,
  NoDuplicates,
} from './array-validators';
export type {
  IdArrayOptions,
  StringArrayOptions,
  NestedArrayOptions,
  ArrayFieldOptions,
} from './array-validators';
export {
  SUPPORTED_CURRENCY_CODES,
  CURRENCY_ENUM,
  CURRENCY_API_PROPERTY,
  CURRENCY_API_PROPERTY_OPTIONAL,
  normalizeCurrencyCode,
  isSupportedCurrencyCode,
} from './is-supported-currency.validator';

export {
  SUBSCRIPTION_PLANS,
  normalizePlanIdentifier,
  isValidPlan,
} from './is-valid-plan.validator';

// ── Platform ─────────────────────────────────────────────────────────────────

export function IsValidPlatform(
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  return ValidateBy(
    {
      name: 'isValidPlatform',
      constraints: [],
      validator: new IsValidPlatformConstraint(),
    },
    validationOptions,
  );
}

export function IsValidPlatforms(
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  return ValidateBy(
    {
      name: 'isValidPlatforms',
      constraints: [],
      validator: new IsValidPlatformsConstraint(),
    },
    validationOptions,
  );
}

// ── Royalty BPS ───────────────────────────────────────────────────────────────

export function IsValidRoyaltyBps(
  options?: RoyaltyBpsValidationOptions,
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  return ValidateBy(
    {
      name: 'isValidRoyaltyBps',
      constraints: [options ?? {}],
      validator: new IsValidRoyaltyBpsConstraint(),
    },
    validationOptions,
  );
}

export function IsStellarTransactionHash(
// ---------------------------------------------------------------------------
// New reusable decorators
// ---------------------------------------------------------------------------

/**
 * Validates a Stellar public key: 56-character Base32 string starting with G.
 *
 * **Swagger** — pair with:
 * ```ts
 * @ApiProperty({ pattern: '^G[A-Z2-7]{55}$', maxLength: 56, example: 'GC6X...' })
 * ```
 */
export function IsStellarAddress(
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  return ValidateBy(
    {
      name: 'isStellarAddress',
      constraints: [],
      validator: new IsStellarAddressConstraint(),
    },
    validationOptions,
  );
}

/**
 * Validates a URL-safe lowercase slug: `[a-z0-9]+(?:-[a-z0-9]+)*`.
 *
 * **Swagger** — pair with:
 * ```ts
 * @ApiProperty({ pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$', example: 'viral-clips' })
 * ```
 */
export function IsSlug(
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  return ValidateBy(
    {
      name: 'isSlug',
      constraints: [],
      validator: new IsSlugConstraint(),
    },
    validationOptions,
  );
}

/**
 * Validates an XLM amount expressed as a string with at most 7 decimal places.
 *
 * Accepts an optional `{ min, max }` to override the default bounds
 * (0.0000001 – 10 000 XLM).
 *
 * **Swagger** — pair with:
 * ```ts
 * @ApiProperty({ type: 'string', pattern: '^\\d+(\\.\\d{1,7})?$', example: '10.5' })
 * ```
 */
export function IsXlmAmount(
  options?: XlmAmountOptions,
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  return ValidateBy(
    {
      name: 'isXlmAmount',
      constraints: [options ?? {}],
      validator: new IsXlmAmountConstraint(),
    },
    validationOptions,
  );
}

/**
 * Validates an ISO 4217 currency code: exactly 3 uppercase ASCII letters.
 *
 * **Swagger** — pair with:
 * ```ts
 * @ApiProperty({ minLength: 3, maxLength: 3, pattern: '^[A-Z]{3}$', example: 'USD' })
 * ```
 */
export function IsIso4217CurrencyCode(
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  return ValidateBy(
    {
      name: 'isStellarTransactionHash',
      constraints: [],
      validator: new IsStellarTransactionHashConstraint(),
      name: 'isIso4217CurrencyCode',
      constraints: [],
      validator: new IsIso4217CurrencyCodeConstraint(),
    },
    validationOptions,
  );
}

/**
 * Validates a user email address with a consistent error message.
 *
 * Prefer this over bare `@IsEmail()` to keep error messages uniform across
 * all DTOs.
 *
 * **Swagger** — pair with:
 * ```ts
 * @ApiProperty({ format: 'email', example: 'user@example.com' })
 * ```
 */
export function IsUserEmail(
// ── Subscription plan ─────────────────────────────────────────────────────────

/**
 * Validates that a string is a supported subscription plan identifier.
 * Accepted values: basic, pro, elite, agency. Comparison is
 * case-insensitive; leading/trailing whitespace is trimmed before matching.
 *
 * Pricing and duration for each plan are determined exclusively by backend
 * configuration, not the request. This decorator validates only that the
 * identifier is known — it never validates or accepts user-supplied prices.
 *
 * @example
 * \@IsValidPlan()
 * plan: string;
 */
export function IsValidPlan(
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  return ValidateBy(
    {
      name: 'isUserEmail',
      constraints: [],
      validator: new IsUserEmailConstraint(),
      name: 'isValidPlan',
      constraints: [],
      validator: new IsValidPlanConstraint(),
    },
    validationOptions,
  );
}

/**
 * Validates that a password field is a string within the allowed length range.
 *
 * Defaults: minLength = 8, maxLength = 128.  For strong-password entropy
 * checking also apply `@IsStrongPassword()` (from `src/auth/validators`).
 *
 * **Swagger** — pair with:
 * ```ts
 * @ApiProperty({ minLength: 8, maxLength: 128, format: 'password' })
 * ```
 */
export function IsPassword(
  options?: PasswordOptions,
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  return ValidateBy(
    {
      name: 'isPassword',
      constraints: [options ?? {}],
      validator: new IsPasswordConstraint(),
    },
    validationOptions,
  );
}

/**
 * Validates a TOTP code: exactly 6 ASCII digits as produced by RFC 6238
 * authenticator apps.
 *
 * **Swagger** — pair with:
 * ```ts
 * @ApiProperty({ minLength: 6, maxLength: 6, pattern: '^\\d{6}$', example: '123456' })
 * ```
 */
export function IsTotpCode(
// ── Currency ──────────────────────────────────────────────────────────────────

/**
 * Validates that a string is a supported ISO 4217 currency code (or crypto
 * equivalent). Accepted values: USD, EUR, GBP, XLM, USDC. Comparison is
 * case-insensitive; leading/trailing whitespace is trimmed before matching.
 *
 * @example
 * \@IsSupportedCurrency()
 * currency: string;
 */
export function IsSupportedCurrency(
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  return ValidateBy(
    {
      name: 'isTotpCode',
      constraints: [],
      validator: new IsTotpCodeConstraint(),
      name: 'isSupportedCurrency',
      constraints: [],
      validator: new IsSupportedCurrencyConstraint(),
    },
    validationOptions,
  );
}
