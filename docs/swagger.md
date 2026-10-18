# Swagger / OpenAPI Documentation

Swagger UI is served at `/api/docs` in non-production environments (or when
`ENABLE_SWAGGER_UI=true`). Authenticate with **Authorize** using a JWT
(`access-token` bearer scheme).

## Security Configuration

### Helmet and CSP Exceptions for Swagger

Swagger UI works seamlessly with Helmet security middleware. The Content Security Policy (CSP) is configured to allow Swagger assets:

- **Script execution**: `script-src 'self' 'unsafe-inline'` when Swagger UI is enabled (needed for SwaggerUIBundle inline initialization)
- **Styles**: `style-src 'self' 'unsafe-inline'` for Swagger's inline styles
- **Images**: `img-src 'self' data: https:` for Swagger logos and badges
- **Production**: CSP is locked down (`script-src 'self'` only) when `ENABLE_SWAGGER_UI=false`

All API responses receive the following security headers (documented in detail in main API description):
- `Content-Security-Policy`
- `Strict-Transport-Security` (HSTS)
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-Powered-By` (removed)

### CSRF Protection

All state-changing requests (`POST`, `PUT`, `PATCH`, `DELETE`) authenticated via httpOnly session cookies require a CSRF token.

**Required Header:**
```http
X-CSRF-Token: <token_value>
```

The token is issued in the `_csrf` cookie during login and must be sent in the `X-CSRF-Token` header for protected mutations.

**Request Example:**
```http
POST /wallets/connect HTTP/1.1
Host: api.clipcash.example
Cookie: _csrf=abc123...; session=xyz789...
X-CSRF-Token: abc123...
Content-Type: application/json

{
  "walletAddress": "GC6X..."
}
```

**403 Invalid CSRF Token Response:**
```json
{
  "statusCode": 403,
  "message": "Invalid CSRF token",
  "error": "Forbidden",
  "requestId": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Exemptions:**
- Requests using `Authorization: Bearer <token>` (JWT)
- Requests using `X-API-Key`
- Read-only methods (`GET`, `HEAD`, `OPTIONS`)

### Authentication Flow

#### OAuth / Social Login

The API supports OAuth 2.0 authentication for social platform integrations:

**OAuth Flow:**
1. **Initiate**: `GET /auth/oauth/:provider` (e.g., `/auth/oauth/google`, `/auth/oauth/twitter`)
   - Redirects to the OAuth provider's consent screen
2. **Callback**: `GET /auth/oauth/:provider/callback`
   - Receives authorization code from provider
   - Exchanges code for access token
   - Creates or updates user account
   - Issues JWT token and sets httpOnly cookie
3. **Authenticated**: Client receives JWT in response or cookie

**Callback Endpoint:**
```
GET /auth/oauth/:provider/callback?code=AUTH_CODE&state=STATE
```

**Response:**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "tokenType": "Bearer",
  "expiresIn": 3600
}
```

**Bearer Authentication:**

After successful login (OAuth or credentials), include the JWT in the `Authorization` header:

```http
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

All protected endpoints in Swagger are marked with 🔒 and require `@ApiBearerAuth('access-token')`.

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

## Password Management

### Forgot Password

**Endpoint:** `POST /auth/forgot-password`

**Request DTO:**
```typescript
{
  email: string; // Valid email address
}
```

**Request Example:**
```json
{
  "email": "user@example.com"
}
```

**Success Response (200 OK):**
```json
{
  "message": "If an account with that email exists, a password reset link has been sent.",
  "requestId": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Error Responses:**
- `400 Bad Request`: Invalid email format
- `429 Too Many Requests`: Rate limit exceeded (3 requests per 15 minutes)
- `500 Internal Server Error`: Email delivery failure

**Notes:**
- Returns success even if email doesn't exist (prevents user enumeration)
- Reset token expires after 1 hour
- Rate limited to prevent abuse

### Reset Password

**Endpoint:** `POST /auth/reset-password`

**Request DTO:**
```typescript
{
  token: string;     // Reset token from email link
  password: string;  // New password (min 8 chars, must include uppercase, lowercase, number, special char)
}
```

**Request Example:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "password": "NewSecurePass123!"
}
```

**Success Response (200 OK):**
```json
{
  "message": "Password has been reset successfully. You can now log in with your new password.",
  "requestId": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Error Responses:**

**400 Bad Request - Invalid Token:**
```json
{
  "statusCode": 400,
  "message": "Invalid or expired reset token",
  "error": "Bad Request",
  "requestId": "550e8400-e29b-41d4-a716-446655440000"
}
```

**400 Bad Request - Weak Password:**
```json
{
  "statusCode": 400,
  "message": "Password must be at least 8 characters and contain uppercase, lowercase, number, and special character",
  "error": "Bad Request",
  "details": [
    {
      "field": "password",
      "errors": ["password must be stronger"]
    }
  ],
  "requestId": "550e8400-e29b-41d4-a716-446655440000"
}
```

**401 Unauthorized - Token Expired:**
```json
{
  "statusCode": 401,
  "message": "Reset token has expired. Please request a new password reset.",
  "error": "Unauthorized",
  "requestId": "550e8400-e29b-41d4-a716-446655440000"
}
```

**429 Too Many Requests:**
```json
{
  "statusCode": 429,
  "message": "ThrottlerException: Too Many Requests",
  "error": "Too Many Requests",
  "requestId": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Rate Limits:**
- Forgot Password: 3 requests per 15 minutes
- Reset Password: 5 requests per 15 minutes

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
