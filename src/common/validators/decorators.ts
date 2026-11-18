import { ValidateBy, ValidationOptions } from 'class-validator';
import { IsValidPlatformConstraint } from './is-valid-platform.validator';
import { IsValidPlatformsConstraint } from './is-valid-platform.validator';
import {
  IsValidRoyaltyBpsConstraint,
  RoyaltyBpsValidationOptions,
  CLIP_ROYALTY_BPS_MAX,
} from './is-valid-royalty-bps.validator';

export { CLIP_ROYALTY_BPS_MAX };

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
