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
import { IsSupportedCurrencyConstraint } from './is-supported-currency.validator';
import { IsValidPlanConstraint } from './is-valid-plan.validator';

export { CLIP_ROYALTY_BPS_MAX };

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
      name: 'isValidPlan',
      constraints: [],
      validator: new IsValidPlanConstraint(),
    },
    validationOptions,
  );
}

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
      name: 'isSupportedCurrency',
      constraints: [],
      validator: new IsSupportedCurrencyConstraint(),
    },
    validationOptions,
  );
}
