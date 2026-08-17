/**
 * Unit tests for safe-math.helper.ts
 *
 * Focuses on boundary values and overflow scenarios to verify that
 * checked arithmetic prevents IEEE-754 precision loss and that the helpers
 * throw `BadRequestException` rather than returning silently corrupted values.
 */
import { BadRequestException } from '@nestjs/common';
import {
  checkedRoyaltyAmount,
  checkedBpsAdd,
} from './safe-math.helper';

// ── checkedRoyaltyAmount ─────────────────────────────────────────────────────

describe('checkedRoyaltyAmount', () => {
  // ── Basic correctness ────────────────────────────────────────────────────

  it('returns 0 when salePrice is 0', () => {
    expect(checkedRoyaltyAmount(0, 1000)).toBe(0);
  });

  it('returns 0 when royaltyBps is 0', () => {
    expect(checkedRoyaltyAmount(1_000_000, 0)).toBe(0);
  });

  it('computes 10% of 100 XLM in stroops (mirrors Soroban test)', () => {
    // 100_000_000 stroops × 1000 bps / 10_000 = 10_000_000
    expect(checkedRoyaltyAmount(100_000_000, 1000)).toBe(10_000_000);
  });

  it('mirrors the Soroban calculate_royalty test case (500 stroops, 1000 bps)', () => {
    // 500 * 1000 / 10_000 = 50
    expect(checkedRoyaltyAmount(500, 1000)).toBe(50);
  });

  it('truncates toward zero (floors fractional stroops)', () => {
    // 101 * 250 / 10_000 = 2.525 → 2
    expect(checkedRoyaltyAmount(101, 250)).toBe(2);
  });

  it('correctly handles 1.5% royalty (150 bps) on a mid-range price', () => {
    // 50_000_000 * 150 / 10_000 = 750_000
    expect(checkedRoyaltyAmount(50_000_000, 150)).toBe(750_000);
  });

  it('returns 0 for minimum non-zero inputs that floor to 0 (salePrice=1, bps=1)', () => {
    // 1 * 1 / 10_000 = 0.0001 → 0
    expect(checkedRoyaltyAmount(1, 1)).toBe(0);
  });

  it('returns 1 for the minimum inputs that produce a non-zero result (salePrice=10000, bps=1)', () => {
    // 10_000 * 1 / 10_000 = 1
    expect(checkedRoyaltyAmount(10_000, 1)).toBe(1);
  });

  // ── Large / max-value tests ───────────────────────────────────────────────

  it('handles large safe-integer sale price at 1500 bps without overflow', () => {
    // 9_000_000_000_000 stroops × 1500 bps / 10_000 = 1_350_000_000_000
    // All values comfortably within Number.MAX_SAFE_INTEGER.
    expect(checkedRoyaltyAmount(9_000_000_000_000, 1500)).toBe(
      1_350_000_000_000,
    );
  });

  it('handles the largest salePrice whose result is still safe at 10000 bps', () => {
    // result = salePrice × 10_000 / 10_000 = salePrice
    // When royaltyBps === denominator, result equals salePrice.
    // Use salePrice = Number.MAX_SAFE_INTEGER is too big (9007... × 10000 overflows).
    // Find the max salePrice where result fits: MAX_SAFE_INTEGER / 1 = MAX_SAFE_INTEGER
    // At 10000 bps: result = salePrice. So salePrice = Number.MAX_SAFE_INTEGER is fine here.
    // But intermediate BigInt product = MAX_SAFE_INT × 10_000 which is handled by BigInt.
    const maxSafeResult = Number.MAX_SAFE_INTEGER; // 2^53 - 1 = 9_007_199_254_740_991
    // result = MAX_SAFE_INT * 10_000 / 10_000 = MAX_SAFE_INT — fits in safe integer
    expect(checkedRoyaltyAmount(maxSafeResult, 10_000)).toBe(maxSafeResult);
  });

  it('returns 0 for salePrice = Number.MAX_SAFE_INTEGER at 0 bps', () => {
    expect(checkedRoyaltyAmount(Number.MAX_SAFE_INTEGER, 0)).toBe(0);
  });

  it('throws BadRequestException when the result exceeds Number.MAX_SAFE_INTEGER', () => {
    // Number.MAX_SAFE_INTEGER = 9_007_199_254_740_991
    // royaltyBps = 1500 → result = floor(MAX_SAFE × 1500 / 10000)
    //   = floor(1_351_079_888_211_148.65) ≈ 1.35 × 10^15  — this IS safe.
    // To overflow the result: we need result > MAX_SAFE.
    // result > MAX_SAFE when salePrice > MAX_SAFE * 10_000 / bps
    // At bps=1: result = salePrice (for salePrice = MAX_SAFE + 10_000, result > MAX_SAFE)
    const overflowPrice = Number.MAX_SAFE_INTEGER + 10_000; // not a safe integer itself,
    // but we pass it as-is to test internal BigInt handling.
    // NOTE: overflowPrice is actually representable as a float (same as MAX_SAFE_INTEGER
    // due to IEEE 754), so we use a different approach: multiply a safe integer by 10_001.
    //
    // Better: salePrice = 10^13 (safe), bps = 10000 → result = 10^13 (safe).
    // salePrice = 9.1 × 10^15 (safe), bps = 10000 → result = 9.1 × 10^15 (safe — equal).
    // For result > MAX_SAFE at bps=1: salePrice > MAX_SAFE (not representable exactly).
    // For result > MAX_SAFE at bps=10: salePrice > MAX_SAFE × 10_000 / 10 = MAX_SAFE × 1000
    //   which is way outside float range.
    // Realistic overflow: large but representable salePrice × high bps.
    // Number.MAX_SAFE_INTEGER × 10 000 / 10_000 = Number.MAX_SAFE_INTEGER — still safe.
    //
    // The only way to produce a result > MAX_SAFE_INTEGER is with:
    //   salePrice > Number.MAX_SAFE_INTEGER / (bps / 10_000)
    //   → salePrice > MAX_SAFE_INT * 10_000 / bps
    // For bps = 1: salePrice > MAX_SAFE_INT * 10_000 → not representable in IEEE 754.
    // For bps = 10_000: result == salePrice. MAX_SAFE_INT * 10000 / 10000 = MAX_SAFE_INT → safe.
    //
    // ∴ The overflow path is reachable through the BigInt arithmetic for internal
    // intermediate products (BigInt of salePrice × BigInt(bps) > MAX_SAFE in BigInt),
    // not the final result. The final result CAN exceed MAX_SAFE if we pass a very
    // large integer float as salePrice.
    //
    // Use a representable large integer: 2^53 - 1 is MAX_SAFE. 2^53 is the next
    // representable even integer. Intermediate product BigInt(2^53) * BigInt(10_000)
    // / BigInt(10_000) = BigInt(2^53) = MAX_SAFE + 1 → throws.
    const justAboveMax = Number.MAX_SAFE_INTEGER + 1; // 2^53 — representable as float
    expect(() => checkedRoyaltyAmount(justAboveMax, 10_000)).toThrow(
      BadRequestException,
    );
  });

  it('throws BadRequestException when the computed royalty exceeds MAX_SAFE_INTEGER (high bps, mid price)', () => {
    // salePrice = Number.MAX_SAFE_INTEGER / 10000 * 10001 rounded up
    // → result slightly above Number.MAX_SAFE_INTEGER
    const threshold = Math.ceil((Number.MAX_SAFE_INTEGER / 10_000) * 10_001);
    // threshold is NOT a safe integer but is representable as a float.
    // At bps = 10_000: result = threshold → above MAX_SAFE → throws.
    expect(() => checkedRoyaltyAmount(threshold, 10_000)).toThrow(
      BadRequestException,
    );
  });

  // ── Input validation ─────────────────────────────────────────────────────

  it('throws BadRequestException for a negative salePrice', () => {
    expect(() => checkedRoyaltyAmount(-1, 500)).toThrow(BadRequestException);
  });

  it('throws BadRequestException for a fractional salePrice', () => {
    expect(() => checkedRoyaltyAmount(1.5, 500)).toThrow(BadRequestException);
  });

  it('throws BadRequestException for a negative royaltyBps', () => {
    expect(() => checkedRoyaltyAmount(1000, -1)).toThrow(BadRequestException);
  });

  it('throws BadRequestException for a fractional royaltyBps', () => {
    expect(() => checkedRoyaltyAmount(1000, 0.5)).toThrow(BadRequestException);
  });

  it('throws BadRequestException for NaN salePrice', () => {
    expect(() => checkedRoyaltyAmount(NaN, 500)).toThrow(BadRequestException);
  });

  it('throws BadRequestException for NaN royaltyBps', () => {
    expect(() => checkedRoyaltyAmount(500, NaN)).toThrow(BadRequestException);
  });

  it('throws BadRequestException for Infinity salePrice', () => {
    expect(() => checkedRoyaltyAmount(Infinity, 500)).toThrow(
      BadRequestException,
    );
  });
});

// ── checkedBpsAdd ────────────────────────────────────────────────────────────

describe('checkedBpsAdd', () => {
  it('returns correct sum for normal BPS values', () => {
    expect(checkedBpsAdd(1000, 200)).toBe(1200);
    expect(checkedBpsAdd(0, 0)).toBe(0);
    expect(checkedBpsAdd(9800, 200)).toBe(10_000);
  });

  it('handles both operands being 0', () => {
    expect(checkedBpsAdd(0, 0)).toBe(0);
  });

  it('returns the correct sum at the protocol max (10000)', () => {
    expect(checkedBpsAdd(5000, 5000)).toBe(10_000);
  });

  it('accepts operand a = 0', () => {
    expect(checkedBpsAdd(0, 1500)).toBe(1500);
  });

  it('accepts operand b = 0', () => {
    expect(checkedBpsAdd(1000, 0)).toBe(1000);
  });

  it('correctly sums large-but-safe values', () => {
    // Both within Number.MAX_SAFE_INTEGER, sum also within.
    const half = Math.floor(Number.MAX_SAFE_INTEGER / 2);
    const result = checkedBpsAdd(half, half);
    expect(result).toBe(half + half);
  });

  // ── Input validation ─────────────────────────────────────────────────────

  it('throws BadRequestException for a negative first operand', () => {
    expect(() => checkedBpsAdd(-1, 100)).toThrow(BadRequestException);
  });

  it('throws BadRequestException for a negative second operand', () => {
    expect(() => checkedBpsAdd(100, -1)).toThrow(BadRequestException);
  });

  it('throws BadRequestException for a fractional first operand', () => {
    expect(() => checkedBpsAdd(1.5, 100)).toThrow(BadRequestException);
  });

  it('throws BadRequestException for a fractional second operand', () => {
    expect(() => checkedBpsAdd(100, 1.5)).toThrow(BadRequestException);
  });

  it('throws BadRequestException for NaN input', () => {
    expect(() => checkedBpsAdd(NaN, 100)).toThrow(BadRequestException);
    expect(() => checkedBpsAdd(100, NaN)).toThrow(BadRequestException);
  });

  it('throws BadRequestException when the sum exceeds Number.MAX_SAFE_INTEGER', () => {
    // BigInt(MAX_SAFE + 1) + BigInt(MAX_SAFE + 1) > MAX_SAFE, but these inputs
    // are representable floats (2^53 each). Their sum as BigInt = 2^54 >> MAX_SAFE.
    const justAboveMax = Number.MAX_SAFE_INTEGER + 1; // 2^53 — representable
    expect(() => checkedBpsAdd(justAboveMax, justAboveMax)).toThrow(
      BadRequestException,
    );
  });
});
