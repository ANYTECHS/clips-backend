# Safe Math for Royalty Calculations

## Overview

This document describes the safe arithmetic strategy employed in the Clips backend to prevent overflow and precision loss in royalty calculations. The implementation ensures that financial calculations cannot silently produce incorrect results due to IEEE-754 floating-point precision limits or integer overflow.

**Issue Reference:** #858 (Safe Math for Royalty Calculations)

## Problem Statement

### IEEE-754 Precision Loss

JavaScript's `number` type is a 64-bit IEEE-754 double, which can represent integers exactly only up to `Number.MAX_SAFE_INTEGER` (2^53 − 1 ≈ 9.007 × 10^15).

Royalty calculations involve multiplying a sale price (in stroops, where 10^7 stroops ≈ 1 XLM) by a basis-point rate (up to 1500 for clips, up to 10,000 for general calculations). For a sale price approaching `Number.MAX_SAFE_INTEGER / 10_000` (~9 × 10^11 stroops, about 90,000 XLM at 1 XLM = 1 USD), the intermediate product silently loses precision:

```javascript
// Without safe arithmetic:
const salePrice = 9_000_000_000_000; // 9 trillion stroops (large but representable)
const royaltyBps = 1500;
const result = (salePrice * royaltyBps) / 10_000;
// IEEE-754 silently corrupts this to an incorrect value
```

### Integer Overflow (Hypothetical in u128 contracts)

While Soroban contracts use u128 for storage, the backend receives these values as JavaScript `number` types after XDR deserialization. If a contract's calculated value exceeds `Number.MAX_SAFE_INTEGER`, it cannot be reliably represented or manipulated in JavaScript.

## Solution: BigInt-Based Checked Arithmetic

All intermediate multiplications and divisions in royalty calculations are performed with `BigInt`, which has arbitrary precision. The result is only converted back to `number` after all safe-integer checks pass.

### Core Functions

Located in `src/common/helpers/safe-math.helper.ts`:

#### `checkedRoyaltyAmount(salePrice: number, royaltyBps: number): number`

Computes `floor(salePrice * royaltyBps / 10_000)` using BigInt arithmetic.

- **Mirrors Soroban semantics:** Uses floor (truncation toward zero) division to match on-chain calculations exactly.
- **Overflow protection:** Throws `BadRequestException` if the result exceeds `Number.MAX_SAFE_INTEGER`.
- **Input validation:** Rejects negative or non-integer inputs.

**Example:**
```typescript
// 100 XLM at 10% royalty (1000 bps)
checkedRoyaltyAmount(100_000_000, 1000); // → 10_000_000 stroops

// Overflow protection
checkedRoyaltyAmount(Number.MAX_SAFE_INTEGER + 1, 10_000); // → throws BadRequestException
```

#### `checkedDivide(dividend: number, divisor: number): number`

Performs safe division with explicit divide-by-zero protection.

- **Divide-by-zero protection:** Throws `BadRequestException` if `divisor <= 0`.
- **Floor division:** Uses integer division (equivalent to `Math.floor(a / b)` for positive integers).
- **Overflow protection:** Throws if the result exceeds `Number.MAX_SAFE_INTEGER`.

**Example:**
```typescript
checkedDivide(100_000_000, 10_000);     // → 10_000
checkedDivide(100, 0);                  // → throws (divide by zero)
checkedDivide(99, 10);                  // → 9 (floor division)
```

#### `checkedSubtract(minuend: number, subtrahend: number): number`

Performs safe subtraction with underflow and overflow protection.

- **Underflow protection:** Throws `BadRequestException` if `subtrahend > minuend`.
- **Negative input rejection:** Both operands must be non-negative.
- **Overflow protection:** Throws if the result exceeds `Number.MAX_SAFE_INTEGER`.

**Example:**
```typescript
checkedSubtract(1000, 200);  // → 800
checkedSubtract(100, 150);   // → throws (underflow)
```

#### `checkedMultiply(a: number, b: number): number`

Performs safe multiplication with overflow protection.

- **Zero short-circuit:** Returns 0 immediately if either operand is 0.
- **Overflow protection:** Throws if the product exceeds `Number.MAX_SAFE_INTEGER`.

**Example:**
```typescript
checkedMultiply(1000, 2000);  // → 2_000_000
checkedMultiply(100_000_000, 100_000_000);  // → throws (overflow)
```

#### `checkedBpsAdd(a: number, b: number): number`

Safely adds two basis-point values.

- **Intended for small values:** BPS values are typically ≤ 10,000, but overflow checks included for completeness.
- **Overflow protection:** Throws if the sum exceeds `Number.MAX_SAFE_INTEGER`.

## Application Areas

### 1. Royalty Calculations

**File:** `src/nft/clip-royalty.service.ts`

The `calculateRoyaltyAmount()` method uses `checkedRoyaltyAmount()` to compute payouts:

```typescript
calculateRoyaltyAmount(salePrice: number, royaltyBps: number): number {
  // Input validation...
  return checkedRoyaltyAmount(salePrice, royaltyBps);
}
```

### 2. Batch Royalty Queries

**File:** `src/nft/batch-royalty.service.ts`

Percentage calculations for batch royalty info use safe division:

```typescript
const percentage = checkedDivide(
  Math.floor((item.fee_numerator / item.fee_denominator) * 10000),
  100,
) / 100;
```

### 3. Configuration Validation

**File:** `src/config/config.service.ts`

Royalty basis-point environment variables are validated at startup to prevent invalid configurations that might cause issues later.

## Error Handling

All safe-math functions throw `BadRequestException` (NestJS HTTP 400) on error:

- **Input validation:** Non-integer or negative values
- **Divide by zero:** Divisor ≤ 0
- **Underflow:** Subtrahend > minuend
- **Overflow:** Result exceeds `Number.MAX_SAFE_INTEGER`

**API consumers** receive a 400 Bad Request response with a descriptive error message:

```json
{
  "statusCode": 400,
  "message": "Royalty amount (9007199254740992) exceeds Number.MAX_SAFE_INTEGER. salePrice=9007199254740991, royaltyBps=1500.",
  "error": "Bad Request"
}
```

## Testing Strategy

Comprehensive unit tests in `src/common/helpers/safe-math.helper.spec.ts` cover:

### Boundary Cases
- Zero inputs (both operands, single operand)
- Maximum safe integer values
- Values just exceeding maximum safe integer

### Precision Tests
- Large sale prices at high royalty rates
- Fractional results that floor to different values
- Results that exactly match `Number.MAX_SAFE_INTEGER`

### Overflow Scenarios
- Product/sum/result exceeding `Number.MAX_SAFE_INTEGER`
- Divide-by-zero attempts
- Underflow in subtraction

### Input Validation
- Negative values
- Fractional values (non-integers)
- NaN and Infinity

### Protocol Conformance
- Mirror Soroban `calculate_royalty` test cases
- Floor division semantics
- Basis-point denominator (10,000) correctness

## Maximum Value Support

The implementation safely handles:

- **Sale prices up to `Number.MAX_SAFE_INTEGER`** (≈ 9.007 × 10^15 stroops)
- **Royalty rates up to 10,000 BPS** (100%)
- **Intermediate products in BigInt** (unlimited precision during calculation)
- **Final results capped at `Number.MAX_SAFE_INTEGER`** (≈ 9.007 × 10^15)

### Typical Limits by Scenario

| Scenario | Max Safe Sale Price | Result @ 1500 BPS | Result @ 10,000 BPS |
|----------|---------------------|-------------------|---------------------|
| XLM-denominated (stroops) | 9 × 10^15 stroops (90M XLM) | 1.35 × 10^15 | 9 × 10^15 |
| USD-denominated | ∞ (not constrained by BigInt) | ∞ | ∞ |

## Documentation & API Contract

### Swagger/OpenAPI Integration

Royalty calculation endpoints document:

- **Parameters:**
  - `salePrice`: Non-negative integer, required
  - `royaltyBps`: Non-negative integer (0-1500), required

- **Responses:**
  - `200 OK`: Calculated royalty amount (safe integer)
  - `400 Bad Request`: Validation error (input validation or overflow)
  - `500 Internal Server Error`: Unexpected contract errors

- **Error Codes:**
  - `INVALID_SALE_PRICE`: Sale price is not a non-negative integer
  - `INVALID_ROYALTY_BPS`: Royalty BPS is outside valid range or not an integer
  - `OVERFLOW`: Result exceeds `Number.MAX_SAFE_INTEGER`

### Example Endpoint Documentation

```typescript
/**
 * Calculate estimated royalty payout for a sale.
 *
 * @param salePrice - Sale price in stroops (non-negative integer)
 * @param royaltyBps - Royalty basis points (0-1500 for clips)
 * @returns Calculated royalty amount
 *
 * @throws BadRequestException if calculation would overflow
 *
 * @example
 * POST /nfts/royalty-estimate
 * { "salePrice": 100_000_000, "royaltyBps": 1000 }
 * Response: { "royaltyAmount": 10_000_000 }
 */
@Post('/royalty-estimate')
estimateRoyalty(@Body() dto: EstimateRoyaltyDto): { royaltyAmount: number } {
  return {
    royaltyAmount: this.clipRoyaltyService.calculateRoyaltyAmount(
      dto.salePrice,
      dto.royaltyBps,
    ),
  };
}
```

## Migration Guide

### For Existing Code

If your code performs royalty calculations, migrate to safe functions:

**Before:**
```typescript
const royalty = (salePrice * royaltyBps) / 10_000;
```

**After:**
```typescript
import { checkedRoyaltyAmount } from '../common/helpers/safe-math.helper';
const royalty = checkedRoyaltyAmount(salePrice, royaltyBps);
```

### For Percentage Calculations

**Before:**
```typescript
const percentage = ((numerator / denominator) * 100).toFixed(2);
```

**After:**
```typescript
import { checkedDivide } from '../common/helpers/safe-math.helper';
const percentage = (checkedDivide(numerator, denominator) * 100 / 100).toFixed(2);
```

## Future Considerations

1. **Additional Operations:** If subtraction or multiplication are needed in royalty contexts, use `checkedSubtract` and `checkedMultiply`.

2. **Decimal/Fractional Amounts:** For USD or other decimal-denominated amounts, consider representing as integers (e.g., cents) to maintain exact arithmetic.

3. **Soroban Contract Sync:** Keep Soroban contract's `calculate_royalty` logic in sync with the backend's safe-math implementation to ensure API estimates match on-chain results.

4. **Performance:** BigInt arithmetic has a small performance cost (~1-2 microseconds per operation). For high-throughput scenarios, benchmark to ensure acceptable latency.

## References

- [IEEE 754 Specification](https://en.wikipedia.org/wiki/Double-precision_floating-point_format)
- [MDN: Number.MAX_SAFE_INTEGER](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number/MAX_SAFE_INTEGER)
- [MDN: BigInt](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/BigInt)
- [Soroban SDK Reference](https://developers.stellar.org/docs/learn/stellar-internals/machine-limits)
- **Issue #858:** Safe Math for Royalty Calculations

## Related Files

- `src/common/helpers/safe-math.helper.ts` — Implementation
- `src/common/helpers/safe-math.helper.spec.ts` — Comprehensive tests
- `src/nft/clip-royalty.service.ts` — Royalty calculation service
- `src/nft/batch-royalty.service.ts` — Batch royalty queries
- `src/config/config.service.ts` — Configuration validation
