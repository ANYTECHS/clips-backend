# Reusable Validation Decorators

All custom decorators live in `src/common/validators/`.  Import from the barrel:

```ts
import {
  IsStellarAddress,
  IsSlug,
  IsXlmAmount,
  IsIso4217CurrencyCode,
  IsUserEmail,
  IsPassword,
  IsTotpCode,
  IsValidPlatform,
  IsValidPlatforms,
  IsValidRoyaltyBps,
} from '../../common/validators/decorators';
```

---

## `@IsUserEmail(options?)`

Validates a user email address with a **consistent error message** across every DTO.

**Replaces** inline `@IsEmail({}, { message: '...' })` calls.

**Rules:** string, non-empty, matches `^[^\s@]+@[^\s@]+\.[^\s@]+$`.

**Error message:** `Please provide a valid email address`

**Swagger** — always pair with an explicit `@ApiProperty`:

```ts
@ApiProperty({
  format: 'email',
  example: 'user@example.com',
})
@IsUserEmail()
email: string;
```

---

## `@IsPassword(options?, validationOptions?)`

Validates a password field: must be a string within the configured length bounds.

Covers **syntactic** requirements only.  Combine with `@IsStrongPassword()` from
`src/auth/validators` when entropy checking is also required (sign-up / password
reset).

| Option      | Type     | Default | Description                |
|-------------|----------|---------|----------------------------|
| `minLength` | `number` | `8`     | Minimum character count    |
| `maxLength` | `number` | `128`   | Maximum character count    |

**Swagger** — always declare the bounds explicitly:

```ts
@ApiProperty({
  minLength: 8,
  maxLength: 128,
  format: 'password',
  example: 'SecurePass123!',
})
@IsPassword({ minLength: 8, maxLength: 128 })
password: string;
```

**Sign-up / password reset** (also apply `@IsStrongPassword()`):

```ts
@ApiProperty({
  minLength: 10,
  maxLength: 32,
  format: 'password',
  description: 'Min zxcvbn score 3 required',
  example: 'Str0ngP@ss2026!',
})
@IsPassword({ minLength: 10, maxLength: 32 })
@IsStrongPassword()
password: string;
```

---

## `@IsTotpCode(options?)`

Validates a TOTP (Time-based One-Time Password) code: exactly **6 ASCII digits**.

**Rules:** string, matches `^\d{6}$`.

**Error message:** `TOTP code must be exactly 6 digits (0–9)`

**Swagger:**

```ts
@ApiPropertyOptional({
  minLength: 6,
  maxLength: 6,
  pattern: '^\\d{6}$',
  example: '123456',
})
@IsOptional()
@IsTotpCode()
totpCode?: string;
```

---

## `@IsStellarAddress(options?)`

Validates a Stellar public key: 56-character Base32 string starting with `G`,
using `STELLAR_PUBLIC_KEY_REGEX` from `@clipcash/shared`.

**Error message:** `<property> must be a valid Stellar public key (G-prefix, Base32, 56 characters)`

**Swagger** — the decorator does not auto-generate OpenAPI constraints; always
declare them explicitly:

```ts
@ApiProperty({
  pattern: '^G[A-Z2-7]{55}$',
  maxLength: 56,
  example: 'GC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3',
  description: 'Stellar public key (G-prefix, Base32, 56 characters)',
})
@IsString()
@IsNotEmpty()
@IsStellarAddress()
walletAddress: string;
```

---

## `@IsSlug(options?)`

Validates a URL-safe lowercase slug: `^[a-z0-9]+(?:-[a-z0-9]+)*$`.

**Valid:** `viral-clips`, `my-collection-2`, `nfts`  
**Invalid:** `Viral-Clips`, `-clip`, `clip--two`, `clip_name`

**Error message:** `<property> must be a lowercase slug (letters, digits and single hyphens), e.g. viral-clips`

**Swagger:**

```ts
@ApiPropertyOptional({
  pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$',
  example: 'viral-clips',
})
@IsOptional()
@IsSlug()
collectionId?: string;
```

---

## `@IsXlmAmount(options?, validationOptions?)`

Validates an XLM amount expressed as a **string** (Stellar amounts are always
strings to preserve 7-decimal precision).

| Option | Type     | Default       | Description              |
|--------|----------|---------------|--------------------------|
| `min`  | `number` | `0.0000001`   | Minimum value (1 stroop) |
| `max`  | `number` | `10000`       | Maximum value in XLM     |

**Rules:** string, matches `^\d+(\.\d{1,7})?$`, numeric value within `[min, max]`.

**Note:** `0.0000001` must be passed as the string `"0.0000001"`, not the number
literal — `String(0.0000001)` produces `"1e-7"` which is correctly rejected.

**Error message:** `amount must be a positive decimal string with at most 7 fractional digits, between <min> and <max> XLM`

**Swagger:**

```ts
@ApiProperty({
  type: 'string',
  pattern: '^\\d+(\\.\\d{1,7})?$',
  example: '10.5',
  description: 'XLM amount (0.0000001 – 10000)',
})
@IsString()
@IsNotEmpty()
@IsXlmAmount()
amount: string;
```

Custom bounds:

```ts
@IsXlmAmount({ min: 1, max: 50000 })
amount: string;
```

---

## `@IsIso4217CurrencyCode(options?)`

Validates a 3-letter uppercase ISO 4217 currency code (structural check only —
does not consult a list of live codes).

**Error message:** `<property> must be a 3-letter ISO 4217 currency code (e.g. USD, XLM, EUR)`

**Swagger:**

```ts
@ApiProperty({
  minLength: 3,
  maxLength: 3,
  pattern: '^[A-Z]{3}$',
  example: 'USD',
})
@IsIso4217CurrencyCode()
currency: string;
```

---

## `@IsValidPlatform(options?)` / `@IsValidPlatforms(options?)`

Validates a single social-media platform string or an array of them against
`SUPPORTED_PLATFORMS` (defined in `is-valid-platform.validator.ts`).

**Error messages** (single): `Invalid platform: "<value>". Supported platforms: …`  
**Error messages** (array): `Invalid platform(s): …. Supported platforms: …`

**Swagger:**

```ts
// Single
@ApiProperty({ enum: SUPPORTED_PLATFORMS, example: 'tiktok' })
@IsValidPlatform()
platform: string;

// Array
@ApiProperty({ type: [String], enum: SUPPORTED_PLATFORMS })
@IsArray()
@IsValidPlatforms()
targetPlatforms: string[];
```

---

## `@IsValidRoyaltyBps(options?, validationOptions?)`

Validates an integer royalty value in basis points.  Accepts `undefined` / `null`
(optional field).

| Option | Type     | Default | Description                      |
|--------|----------|---------|----------------------------------|
| `max`  | `number` | `10000` | Inclusive upper bound in BPS     |

Use `CLIP_ROYALTY_BPS_MAX` (1500) for per-clip royalty fields.

**Swagger:**

```ts
@ApiPropertyOptional({
  minimum: 0,
  maximum: 1500,
  example: 1000,
  description: 'Royalty in basis points (0–1500 = 0–15%)',
})
@IsOptional()
@Type(() => Number)
@IsValidRoyaltyBps({ max: CLIP_ROYALTY_BPS_MAX })
royaltyBps?: number;
```

---

## Adding a new validator

1. Create `src/common/validators/is-<name>.validator.ts` with a class decorated
   `@ValidatorConstraint({ name: '<camelName>', async: false })` implementing
   `ValidatorConstraintInterface`.
2. Create `src/common/validators/is-<name>.validator.spec.ts` with unit tests for
   valid values, invalid values, non-string inputs, and the error message.
3. Add a function decorator export to `decorators.ts` calling `ValidateBy`.
4. Document it in this file, including required Swagger pairing.

The validator class should be **independent of NestJS** (no `@Injectable()` and no
imports from `@nestjs/*`) so it can be unit-tested without bootstrapping a module.
