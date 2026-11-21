import { ValidateBy, ValidationOptions } from 'class-validator';
import { IsValidPlatformConstraint, IsValidPlatformsConstraint } from './is-valid-platform.validator';
import {
  IsValidRoyaltyBpsConstraint,
  RoyaltyBpsValidationOptions,
  CLIP_ROYALTY_BPS_MAX,
} from './is-valid-royalty-bps.validator';
import { IsStellarTransactionHashConstraint, STELLAR_TX_HASH_REGEX } from './is-stellar-transaction-hash.validator';
import { IsStellarAddressConstraint } from './is-stellar-address.validator';
import { IsSlugConstraint } from './is-slug.validator';
import { IsXlmAmountConstraint, XlmAmountOptions } from './is-xlm-amount.validator';
import { IsIso4217CurrencyCodeConstraint } from './is-iso4217-currency-code.validator';
import { IsUserEmailConstraint } from './is-user-email.validator';
import { IsPasswordConstraint, PasswordOptions } from './is-password.validator';
import { IsTotpCodeConstraint } from './is-totp-code.validator';
import { IsSupportedCurrencyConstraint } from './is-supported-currency.validator';
import { IsValidPlanConstraint } from './is-valid-plan.validator';

export { CLIP_ROYALTY_BPS_MAX, STELLAR_TX_HASH_REGEX };
export type { RoyaltyBpsValidationOptions, XlmAmountOptions, PasswordOptions };
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

export function IsValidPlatform(validationOptions?: ValidationOptions): PropertyDecorator {
  return ValidateBy(
    { name: 'isValidPlatform', constraints: [], validator: new IsValidPlatformConstraint() },
    validationOptions,
  );
}

export function IsValidPlatforms(validationOptions?: ValidationOptions): PropertyDecorator {
  return ValidateBy(
    { name: 'isValidPlatforms', constraints: [], validator: new IsValidPlatformsConstraint() },
    validationOptions,
  );
}

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

export function IsStellarTransactionHash(validationOptions?: ValidationOptions): PropertyDecorator {
  return ValidateBy(
    {
      name: 'isStellarTransactionHash',
      constraints: [],
      validator: new IsStellarTransactionHashConstraint(),
    },
    validationOptions,
  );
}

export function IsStellarAddress(validationOptions?: ValidationOptions): PropertyDecorator {
  return ValidateBy(
    { name: 'isStellarAddress', constraints: [], validator: new IsStellarAddressConstraint() },
    validationOptions,
  );
}

export function IsSlug(validationOptions?: ValidationOptions): PropertyDecorator {
  return ValidateBy(
    { name: 'isSlug', constraints: [], validator: new IsSlugConstraint() },
    validationOptions,
  );
}

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

export function IsIso4217CurrencyCode(validationOptions?: ValidationOptions): PropertyDecorator {
  return ValidateBy(
    {
      name: 'isIso4217CurrencyCode',
      constraints: [],
      validator: new IsIso4217CurrencyCodeConstraint(),
    },
    validationOptions,
  );
}

export function IsUserEmail(validationOptions?: ValidationOptions): PropertyDecorator {
  return ValidateBy(
    { name: 'isUserEmail', constraints: [], validator: new IsUserEmailConstraint() },
    validationOptions,
  );
}

export function IsValidPlan(validationOptions?: ValidationOptions): PropertyDecorator {
  return ValidateBy(
    { name: 'isValidPlan', constraints: [], validator: new IsValidPlanConstraint() },
    validationOptions,
  );
}

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

export function IsTotpCode(validationOptions?: ValidationOptions): PropertyDecorator {
  return ValidateBy(
    { name: 'isTotpCode', constraints: [], validator: new IsTotpCodeConstraint() },
    validationOptions,
  );
}

export function IsSupportedCurrency(validationOptions?: ValidationOptions): PropertyDecorator {
  return ValidateBy(
    {
      name: 'isSupportedCurrency',
      constraints: [],
      validator: new IsSupportedCurrencyConstraint(),
    },
    validationOptions,
  );
}
