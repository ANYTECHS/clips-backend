import {
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';

export const DEFAULT_ROYALTY_BPS_MAX = 10000;
export const CLIP_ROYALTY_BPS_MAX = 1500;

export interface RoyaltyBpsValidationOptions {
  max?: number;
}

@ValidatorConstraint({ name: 'isValidRoyaltyBps', async: false })
export class IsValidRoyaltyBpsConstraint implements ValidatorConstraintInterface {
  private maxBps = DEFAULT_ROYALTY_BPS_MAX;

  validate(value: unknown, args: ValidationArguments): boolean {
    if (value === undefined || value === null) {
      return true;
    }

    const options = args.constraints[0] as RoyaltyBpsValidationOptions | undefined;
    this.maxBps = options?.max ?? DEFAULT_ROYALTY_BPS_MAX;

    if (typeof value !== 'number' || !Number.isInteger(value)) {
      return false;
    }

    return value >= 0 && value <= this.maxBps;
  }

  defaultMessage(): string {
    return `royaltyBps must be an integer between 0 and ${this.maxBps}`;
  }
}
