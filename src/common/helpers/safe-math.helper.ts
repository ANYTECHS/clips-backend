/**
 * Safe (checked) arithmetic helpers for royalty calculations.
 *
 * ## Why this file exists
 *
 * JavaScript's `number` type is a 64-bit IEEE-754 double, which can represent
 * integers exactly only up to `Number.MAX_SAFE_INTEGER` (2^53 − 1 ≈ 9 × 10^15).
 * Royalty calculations involve multiplying a sale price (in stroops, where
 * 10^7 stroops ≈ 1 XLM) by a basis-point rate (up to 10 000). For a sale price
 * that approaches `Number.MAX_SAFE_INTEGER / 10_000` (~9 × 10^11 stroops, about
 * 90 000 XLM at 1 XLM = 1 USD) the intermediate product `salePrice * royaltyBps`
 * silently loses precision, producing an incorrect royalty payout.
 *
 * ## Strategy
 *
 * All intermediate multiplications are performed with `BigInt` so the full
 * integer range is preserved, then the result is converted back to `number`
 * only after dividing by the basis-point denominator. An explicit safety check
 * ensures the final quotient fits in a safe integer; values above
 * `Number.MAX_SAFE_INTEGER` are rejected with a `BadRequestException` so the
 * caller receives a clear error rather than silent corruption.
 *
 * ## Overflow handling
 *
 * | Input range                                    | Behaviour                             |
 * |------------------------------------------------|---------------------------------------|
 * | `salePrice < 0` or non-integer                 | Rejected by upstream validators        |
 * | `salePrice === 0` or `royaltyBps === 0`        | Returns `0` immediately                |
 * | product fits in `Number.MAX_SAFE_INTEGER`      | Exact `number` result returned         |
 * | product exceeds `Number.MAX_SAFE_INTEGER`      | `BadRequestException` thrown           |
 */

import { BadRequestException } from '@nestjs/common';

/**
 * The basis-point denominator used throughout the royalty protocol.
 * 10 000 bps = 100 %.
 */
export const ROYALTY_BPS_DENOMINATOR = 10_000n;

/**
 * BigInt representation of `Number.MAX_SAFE_INTEGER` (2^53 − 1).
 * Used as the ceiling for safe-integer checks after BigInt arithmetic.
 */
const MAX_SAFE_INT_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);

/**
 * Computes `floor(salePrice * royaltyBps / 10_000)` using `BigInt` arithmetic
 * to prevent IEEE-754 precision loss on large values.
 *
 * Mirrors the Soroban contract's `calculate_royalty` integer-division semantics
 * (truncation toward zero), so API estimates match on-chain payouts exactly.
 *
 * @param salePrice  - Sale price in stroops. Must be a non-negative safe integer.
 * @param royaltyBps - Royalty rate in basis points (0 – 10 000).
 * @returns The royalty amount in stroops, truncated toward zero.
 *
 * @throws {BadRequestException} if `salePrice` is not a non-negative integer.
 * @throws {BadRequestException} if the result exceeds `Number.MAX_SAFE_INTEGER`.
 *
 * @example
 * checkedRoyaltyAmount(100_000_000, 1000); // → 10_000_000  (10 % of 100 XLM)
 * checkedRoyaltyAmount(0, 1000);           // → 0
 * checkedRoyaltyAmount(500, 1000);         // → 50           (mirrors Soroban test)
 * checkedRoyaltyAmount(101, 250);          // → 2            (rounds down 2.525)
 */
export function checkedRoyaltyAmount(
  salePrice: number,
  royaltyBps: number,
): number {
  if (!Number.isInteger(salePrice) || salePrice < 0) {
    throw new BadRequestException(
      `Invalid salePrice: ${salePrice}. Must be a non-negative integer.`,
    );
  }

  if (!Number.isInteger(royaltyBps) || royaltyBps < 0) {
    throw new BadRequestException(
      `Invalid royaltyBps: ${royaltyBps}. Must be a non-negative integer.`,
    );
  }

  if (salePrice === 0 || royaltyBps === 0) {
    return 0;
  }

  // Perform the multiplication in BigInt to avoid IEEE-754 precision loss.
  const product = BigInt(salePrice) * BigInt(royaltyBps);
  const result = product / ROYALTY_BPS_DENOMINATOR; // integer (floor) division

  if (result > MAX_SAFE_INT_BIGINT) {
    throw new BadRequestException(
      `Royalty amount (${result}) exceeds Number.MAX_SAFE_INTEGER. ` +
        `salePrice=${salePrice}, royaltyBps=${royaltyBps}.`,
    );
  }

  return Number(result);
}

/**
 * Adds two basis-point values and ensures the sum does not overflow a safe
 * integer. In practice BPS values are small (≤ 10 000 each), but the check
 * is included for completeness and future-proofing.
 *
 * @param a - First basis-point value (non-negative integer).
 * @param b - Second basis-point value (non-negative integer).
 * @returns `a + b` as a safe integer.
 *
 * @throws {BadRequestException} if either input is not a non-negative integer,
 *   or if the sum exceeds `Number.MAX_SAFE_INTEGER`.
 */
export function checkedBpsAdd(a: number, b: number): number {
  if (!Number.isInteger(a) || a < 0) {
    throw new BadRequestException(
      `Invalid bps value: ${a}. Must be a non-negative integer.`,
    );
  }
  if (!Number.isInteger(b) || b < 0) {
    throw new BadRequestException(
      `Invalid bps value: ${b}. Must be a non-negative integer.`,
    );
  }

  const sum = BigInt(a) + BigInt(b);

  if (sum > MAX_SAFE_INT_BIGINT) {
    throw new BadRequestException(
      `BPS sum (${sum}) exceeds Number.MAX_SAFE_INTEGER. a=${a}, b=${b}.`,
    );
  }

  return Number(sum);
}

/**
 * Performs safe division with explicit divide-by-zero protection and overflow checks.
 * Ensures both dividend and divisor are validated as non-negative integers, and
 * that the result fits safely within JavaScript's safe integer range.
 *
 * @param dividend - The numerator (non-negative integer).
 * @param divisor  - The denominator (positive integer, must be > 0).
 * @returns `floor(dividend / divisor)` as a safe integer.
 *
 * @throws {BadRequestException} if dividend is not a non-negative integer.
 * @throws {BadRequestException} if divisor is not a positive integer (divisor <= 0).
 * @throws {BadRequestException} if the result exceeds `Number.MAX_SAFE_INTEGER`.
 *
 * @example
 * checkedDivide(100_000_000, 10_000); // → 10_000  (floor division)
 * checkedDivide(100, 0);              // → throws BadRequestException (divide by zero)
 * checkedDivide(-100, 10);            // → throws BadRequestException (negative dividend)
 */
export function checkedDivide(dividend: number, divisor: number): number {
  if (!Number.isInteger(dividend) || dividend < 0) {
    throw new BadRequestException(
      `Invalid dividend: ${dividend}. Must be a non-negative integer.`,
    );
  }

  if (!Number.isInteger(divisor) || divisor <= 0) {
    throw new BadRequestException(
      `Invalid divisor: ${divisor}. Must be a positive integer (> 0).`,
    );
  }

  const result = BigInt(dividend) / BigInt(divisor); // integer (floor) division

  if (result > MAX_SAFE_INT_BIGINT) {
    throw new BadRequestException(
      `Division result (${result}) exceeds Number.MAX_SAFE_INTEGER. ` +
        `dividend=${dividend}, divisor=${divisor}.`,
    );
  }

  return Number(result);
}

/**
 * Performs safe subtraction with underflow and overflow protection.
 * Ensures both minuend and subtrahend are non-negative integers, and prevents
 * negative results (underflow protection).
 *
 * @param minuend    - The value to subtract from (non-negative integer).
 * @param subtrahend - The value to subtract (non-negative integer).
 * @returns `minuend - subtrahend` as a non-negative safe integer.
 *
 * @throws {BadRequestException} if either input is not a non-negative integer.
 * @throws {BadRequestException} if subtrahend > minuend (underflow).
 * @throws {BadRequestException} if the result exceeds `Number.MAX_SAFE_INTEGER`.
 *
 * @example
 * checkedSubtract(1000, 200);  // → 800
 * checkedSubtract(100, 150);   // → throws BadRequestException (underflow)
 * checkedSubtract(-50, 10);    // → throws BadRequestException (negative minuend)
 */
export function checkedSubtract(minuend: number, subtrahend: number): number {
  if (!Number.isInteger(minuend) || minuend < 0) {
    throw new BadRequestException(
      `Invalid minuend: ${minuend}. Must be a non-negative integer.`,
    );
  }

  if (!Number.isInteger(subtrahend) || subtrahend < 0) {
    throw new BadRequestException(
      `Invalid subtrahend: ${subtrahend}. Must be a non-negative integer.`,
    );
  }

  if (subtrahend > minuend) {
    throw new BadRequestException(
      `Subtraction underflow: ${minuend} - ${subtrahend} would be negative.`,
    );
  }

  const difference = BigInt(minuend) - BigInt(subtrahend);

  if (difference > MAX_SAFE_INT_BIGINT) {
    throw new BadRequestException(
      `Subtraction result (${difference}) exceeds Number.MAX_SAFE_INTEGER. ` +
        `minuend=${minuend}, subtrahend=${subtrahend}.`,
    );
  }

  return Number(difference);
}

/**
 * Performs safe multiplication with overflow protection.
 * Used for cases where two integers must be multiplied (not specific to royalties).
 *
 * @param a - First operand (non-negative integer).
 * @param b - Second operand (non-negative integer).
 * @returns `a * b` as a safe integer.
 *
 * @throws {BadRequestException} if either input is not a non-negative integer.
 * @throws {BadRequestException} if the product exceeds `Number.MAX_SAFE_INTEGER`.
 *
 * @example
 * checkedMultiply(1000, 2000);  // → 2_000_000
 * checkedMultiply(0, 500);      // → 0
 */
export function checkedMultiply(a: number, b: number): number {
  if (!Number.isInteger(a) || a < 0) {
    throw new BadRequestException(
      `Invalid first operand: ${a}. Must be a non-negative integer.`,
    );
  }

  if (!Number.isInteger(b) || b < 0) {
    throw new BadRequestException(
      `Invalid second operand: ${b}. Must be a non-negative integer.`,
    );
  }

  if (a === 0 || b === 0) {
    return 0;
  }

  const product = BigInt(a) * BigInt(b);

  if (product > MAX_SAFE_INT_BIGINT) {
    throw new BadRequestException(
      `Product (${product}) exceeds Number.MAX_SAFE_INTEGER. a=${a}, b=${b}.`,
    );
  }

  return Number(product);
}
