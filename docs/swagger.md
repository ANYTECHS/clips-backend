# Swagger / OpenAPI Documentation

Swagger UI is served at `/api/docs` in non-production environments (or when
`ENABLE_SWAGGER_UI=true`). Authenticate with **Authorize** using a JWT
(`access-token` bearer scheme).

## Sections (tags)

| Tag | Covers |
|-----|--------|
| `auth` | Registration, login, tokens, MFA |
| `users` | User profile management |
| `videos` / `clips` | Video upload and clip generation |
| `wallets` | Stellar wallet connection |
| `nfts` / `nft` | NFT minting and royalties |
| `subscriptions` | Subscription plans and lifecycle |
| `payments` | Fiat and Stellar subscription payments |
| `payout` / `payout-methods` | Payout requests, Stellar payouts, status, history |
| `earnings` | Earnings summary, history, exports |
| `webhooks` | Inbound webhooks from external services |

Add `@ApiTags('<tag>')` to every controller and register new tags in
`src/main.ts` via `DocumentBuilder.addTag()`.

## Standard error responses

All errors share `ErrorResponseDto` (`src/common/dtos/error-response.dto.ts`):

```json
{
  "statusCode": 400,
  "message": "Invalid request",
  "error": "Bad Request",
  "requestId": "550e8400-e29b-41d4-a716-446655440000"
}
```

Use the `ApiStandardErrors` decorator
(`src/common/decorators/api-standard-errors.decorator.ts`) instead of ad-hoc
error decorators:

```ts
@ApiStandardErrors()           // 400, 401, 403, 429, 500
@Controller('payouts')
export class PayoutsController {
  @Get(':id')
  @ApiStandardErrors(404)      // add endpoint-specific statuses
  findOne() {}
}
```

Supported statuses: `400`, `401`, `403`, `404`, `409`, `429`, `500`.

## Endpoint checklist

Each public endpoint should declare:

- `@ApiOperation({ summary, description })`
- Request schema — DTO with `@ApiProperty({ example, description, enum })`
- Response schema — `@ApiResponse({ status, type | schema })` with an example
- Authentication — `@ApiBearerAuth('access-token')` for protected routes
- Error responses — `@ApiStandardErrors(...)`

## Pagination

List endpoints return `PaginatedResponseDto` (`src/common/dtos/api-response.dto.ts`):

```json
{
  "items": [],
  "total": 42,
  "page": 1,
  "limit": 20,
  "totalPages": 3,
  "hasNextPage": true,
  "hasPrevPage": false
}
```

## CORS Configuration

Swagger UI remains fully accessible even with CORS restrictions in place.

### Allowed Origins

The API maintains an explicit allow-list of origins for CORS requests:

**Development (default):**
- `http://localhost:3000`
- `http://127.0.0.1:3000`

**Production:**
- Only origins listed in the `ALLOWED_ORIGINS` environment variable (comma-separated)
- Empty by default — must be explicitly configured

### Swagger UI Accessibility

Swagger UI is served from the same origin as the API (`/api/docs` in non-production or when `ENABLE_SWAGGER_UI=true`), 
so it is not affected by CORS restrictions. The docs remain accessible regardless of the `ALLOWED_ORIGINS` configuration.

### Configuring Origins

Set allowed origins via the `ALLOWED_ORIGINS` environment variable:

```bash
# Example: Allow localhost and staging domains
ALLOWED_ORIGINS=http://localhost:3000,https://staging.example.com,https://app.example.com
```

Methods and headers can similarly be configured via `ALLOWED_METHODS` and `ALLOWED_HEADERS` (comma-separated).

## Authentication Endpoints

### Verification Endpoint

The `/auth/verify` endpoint validates a user's email address using a verification token.

**Endpoint:** `POST /auth/verify`

**Request:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Response (200):**
```json
{
  "message": "Email verified successfully",
  "userId": 123,
  "email": "user@example.com"
}
```

**Responses:**
- `200 OK` — Email verified successfully
- `400 Bad Request` — Invalid or missing token
- `401 Unauthorized` — Token has expired
- `409 Conflict` — Email already verified

### Resend Verification Endpoint

The `/auth/resend-verification` endpoint resends the verification email.

**Endpoint:** `POST /auth/resend-verification`

**Request:**
```json
{
  "email": "user@example.com"
}
```

**Response (200):**
```json
{
  "message": "Verification email sent",
  "email": "user@example.com"
}
```

**Responses:**
- `200 OK` — Verification email sent
- `400 Bad Request` — Invalid email or not found
- `429 Too Many Requests` — Rate limit exceeded (max 3 per hour)

**Rate Limit:** This endpoint uses the `emailVerify` throttle (3 requests per hour).

## Two-Factor Authentication (2FA) Endpoints

### Enable 2FA

Enables TOTP-based two-factor authentication for the authenticated user.

**Endpoint:** `POST /auth/2fa/enable`

**Authentication:** Required (`Bearer <jwt>`)

**Response (200):**
```json
{
  "qrCode": "data:image/png;base64,iVBORw0KGgoAAAANS...",
  "secret": "JBSWY3DPEBLW64TMMQ======",
  "manualEntry": "otpauth://totp/ClipCash:user@example.com?secret=JBSWY3DPEBLW64TMMQ======&issuer=ClipCash"
}
```

**Schema:**
- `qrCode` (string, base64 PNG image) — QR code for scanning with authenticator app
- `secret` (string) — Manual entry secret for authenticator apps
- `manualEntry` (string) — otpauth:// URI for manual entry or importing

**Responses:**
- `200 OK` — 2FA enabled and setup initiated
- `401 Unauthorized` — JWT token required or invalid
- `409 Conflict` — 2FA already enabled for this user

### Disable 2FA

Disables two-factor authentication for the authenticated user.

**Endpoint:** `POST /auth/2fa/disable`

**Authentication:** Required (`Bearer <jwt>`)

**Request:**
```json
{
  "totp": "123456"
}
```

**Response (200):**
```json
{
  "message": "2FA disabled successfully"
}
```

**Responses:**
- `200 OK` — 2FA disabled
- `400 Bad Request` — Invalid TOTP code
- `401 Unauthorized` — JWT token required or invalid
- `429 Too Many Requests` — Rate limit exceeded (max 3 per 15 minutes)

### Verify TOTP

Verifies a Time-based One-Time Password during login or account operations.

**Endpoint:** `POST /auth/2fa/verify`

**Request:**
```json
{
  "email": "user@example.com",
  "totp": "123456"
}
```

**Response (200):**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": 3600
}
```

**Responses:**
- `200 OK` — TOTP verified, tokens issued
- `400 Bad Request` — Invalid TOTP code or format
- `401 Unauthorized` — Invalid email or user not found
- `429 Too Many Requests` — Rate limit exceeded (max 5 per 60 seconds)

## Expired Token Responses

### Expired Access Token

When an access token has expired, the API returns `401 Unauthorized`:

```json
{
  "statusCode": 401,
  "message": "Access token has expired",
  "error": "Unauthorized"
}
```

**Client Action:** Use the refresh token to obtain a new access token.

### Expired Refresh Token

When a refresh token has expired:

```json
{
  "statusCode": 401,
  "message": "Refresh token has expired",
  "error": "Unauthorized"
}
```

**Client Action:** User must re-authenticate (login again).

### Expired Verification Token

When an email verification token has expired:

```json
{
  "statusCode": 401,
  "message": "Verification token has expired",
  "error": "Unauthorized"
}
```

**Client Action:** Request a new verification email via `/auth/resend-verification`.

## Request / Response DTOs

### Common Request DTOs

**VerifyEmailRequestDto:**
```json
{
  "token": "string (JWT)"
}
```

**ResendVerificationRequestDto:**
```json
{
  "email": "string (email format)"
}
```

**Enable2FARequestDto:**
```json
{
  "password": "string (optional, for additional security)"
}
```

**Disable2FARequestDto:**
```json
{
  "totp": "string (6 digits)"
}
```

**Verify2FARequestDto:**
```json
{
  "email": "string (email format)",
  "totp": "string (6 digits)"
}
```

### Common Response DTOs

**VerifyEmailResponseDto:**
```json
{
  "message": "string",
  "userId": "number",
  "email": "string"
}
```

**Enable2FAResponseDto:**
```json
{
  "qrCode": "string (base64 PNG)",
  "secret": "string",
  "manualEntry": "string (otpauth URI)"
}
```

**Disable2FAResponseDto:**
```json
{
  "message": "string"
}
```

**Verify2FAResponseDto (LoginResponseDto):**
```json
{
  "access_token": "string (JWT)",
  "refresh_token": "string (JWT)",
  "expiresIn": "number (seconds)"
}
```

**AuthenticationErrorResponseDto (401):**
```json
{
  "statusCode": 401,
  "message": "string (specific reason: expired, invalid, missing, etc.)",
  "error": "Unauthorized"
}
```
