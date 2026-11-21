import {
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';

export interface XlmAmountOptions {
  /**
   * Minimum XLM amount (inclusive).  Defaults to 0.0000001 (1 stroop).
   */
  min?: number;
  /**
   * Maximum XLM amount (inclusive).  Defaults to 10 000 XLM.
   */
  max?: number;
}

/** Minimum sendable amount: 1 stroop = 0.0000001 XLM */
export const XLM_AMOUNT_MIN = 0.0000001;
/** Default maximum sendable amount per transaction */
export const XLM_AMOUNT_MAX = 10_000;

/**
 * Validates that a value is a string representation of a positive XLM amount.
 *
 * Rules:
 * - Must be a string (Stellar amounts are always transmitted as strings to
 *   preserve precision).
 * - Must match `/^\d+(\.\d{1,7})?$/` — a non-negative integer or decimal with
 *   at most 7 fractional digits (1 stroop resolution).
 * - The numeric value must be within the configured `[min, max]` bounds.
 *
 * Usage — apply the `@IsXlmAmount()` decorator from `decorators.ts` instead of
 * instantiating this class directly.
 */
@ValidatorConstraint({ name: 'isXlmAmount', async: false })
export class IsXlmAmountConstraint implements ValidatorConstraintInterface {
  private static readonly AMOUNT_REGEX = /^\d+(\.\d{1,7})?$/;

  private resolvedMin = XLM_AMOUNT_MIN;
  private resolvedMax = XLM_AMOUNT_MAX;

  validate(value: unknown, args: ValidationArguments): boolean {
    const opts = (args.constraints[0] ?? {}) as XlmAmountOptions;
    this.resolvedMin = opts.min ?? XLM_AMOUNT_MIN;
    this.resolvedMax = opts.max ?? XLM_AMOUNT_MAX;

    if (typeof value !== 'string') return false;
    if (!IsXlmAmountConstraint.AMOUNT_REGEX.test(value)) return false;

    const n = parseFloat(value);
    return n >= this.resolvedMin && n <= this.resolvedMax;
  }

  defaultMessage(_args: ValidationArguments): string {
    return (
      `amount must be a positive decimal string with at most 7 fractional digits, ` +
      `between ${this.resolvedMin} and ${this.resolvedMax} XLM`
    );
  }
}
