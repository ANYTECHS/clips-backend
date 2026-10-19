# Authentication API Swagger Documentation

This document describes the Swagger/OpenAPI contract for authentication endpoints, including device information capture, authentication failure responses, and account lockout handling.

## Overview

The authentication system provides:

- JWT-based access token issuance for API requests
- Refresh token rotation with device fingerprinting
- Multi-factor authentication (TOTP) support
- Brute-force protection with account lockout
- Rate limiting on sensitive authentication operations
- Device information capture and binding

## HTTP Status Codes and Responses

### 200 OK — Successful Authentication

**Endpoint:** `POST /auth/login`, `POST /auth/refresh`

**Response Body:**

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "refresh_opaque_value_32bytes",
  "userId": 42,
  "email": "user@example.com",
  "emailVerified": true,
  "expiresIn": 3600,
  "mfaEnabled": false,
  "device": {
    "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "deviceFingerprint": "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6",
    "ipAddress": "192.0.2.1",
    "platform": "Windows",
    "browser": "Chrome 120.0"
  }
}
```

**Device Information Fields:**

- `userAgent` — Browser/client user agent string; used for device fingerprinting
- `deviceFingerprint` — Hashed fingerprint (computed from user agent, IP, and platform); used for refresh token binding and session hijack detection
- `ipAddress` — Client IP address (when available in request headers)
- `platform` — Operating system (Windows, macOS, Linux, iOS, Android, etc.)
- `browser` — Browser name and version parsed from user agent

**Security Context:**

- Device information is used to detect potential session hijack attempts
- Refresh tokens are bound to a device via the fingerprint
- A mismatch on token refresh revokes all outstanding tokens for the user and returns `401 Unauthorized`
- Device info is attached to audit logs for security analysis

---

### 401 Unauthorized — Authentication Failure

**Scenarios:**

1. **Invalid Credentials**
   ```json
   {
     "statusCode": 401,
     "errorCode": "INVALID_CREDENTIALS",
     "message": "Invalid email or password",
     "reason": "remaining attempts: 2",
     "requestId": "f47ac10b-58cc-4372-a567-0e02b2c3d479"
   }
   ```

2. **Email Not Verified**
   ```json
   {
     "statusCode": 401,
     "errorCode": "EMAIL_NOT_VERIFIED",
     "message": "Email address must be verified before login",
     "reason": "Verify your email and try again",
     "requestId": "f47ac10b-58cc-4372-a567-0e02b2c3d479"
   }
   ```

3. **TOTP Code Required (MFA Enabled)**
   ```json
   {
     "statusCode": 401,
     "errorCode": "MFA_REQUIRED",
     "message": "Multi-factor authentication required. Send TOTP code in next request.",
     "requestId": "f47ac10b-58cc-4372-a567-0e02b2c3d479"
   }
   ```

4. **Invalid or Expired TOTP Code**
   ```json
   {
     "statusCode": 401,
     "errorCode": "INVALID_TOTP",
     "message": "TOTP code is invalid or has expired",
     "reason": "TOTP codes are valid for 30 seconds",
     "requestId": "f47ac10b-58cc-4372-a567-0e02b2c3d479"
   }
   ```

5. **Expired or Invalid Token**
   ```json
   {
     "statusCode": 401,
     "errorCode": "INVALID_TOKEN",
     "message": "Invalid or expired authentication token",
     "requestId": "f47ac10b-58cc-4372-a567-0e02b2c3d479"
   }
   ```

6. **Token Revoked (Device Fingerprint Mismatch)**
   ```json
   {
     "statusCode": 401,
     "errorCode": "SESSION_HIJACK_DETECTED",
     "message": "Session token has been revoked. Possible unauthorized access detected.",
     "reason": "Device fingerprint mismatch. All refresh tokens have been revoked.",
     "requestId": "f47ac10b-58cc-4372-a567-0e02b2c3d479"
   }
   ```

**Standard Error Fields:**

- `statusCode` — HTTP status code (401)
- `errorCode` — Machine-readable error code for programmatic handling
- `message` — Human-readable error message
- `reason` — Additional context (optional); may include "remaining attempts" countdown before lockout
- `requestId` — Request correlation ID for tracing and audit logs

---

### 423 Locked — Account Locked After Repeated Failed Attempts

**Endpoint:** `POST /auth/login`

**Response Body:**

```json
{
  "statusCode": 423,
  "errorCode": "ACCOUNT_LOCKED",
  "message": "Account temporarily locked due to too many failed login attempts",
  "lockoutTimeLeft": 450,
  "lockedUntil": 1710274800,
  "requestId": "f47ac10b-58cc-4372-a567-0e02b2c3d479"
}
```

**Fields:**

- `statusCode` — HTTP status code (423 Locked)
- `errorCode` — Always `ACCOUNT_LOCKED`
- `message` — Description of the lockout
- `lockoutTimeLeft` — Remaining lockout duration in **seconds** (example: 450 = 7.5 minutes remaining)
- `lockedUntil` — Absolute time the lockout expires (Unix timestamp in seconds)
- `requestId` — Request correlation ID

**Behavior:**

- Triggered after 5 consecutive failed login attempts (configurable via `BRUTE_FORCE_MAX_ATTEMPTS`)
- Lockout duration: 15 minutes by default (configurable via `BRUTE_FORCE_LOCKOUT_DURATION`)
- Successful login clears all failed attempt counters
- All login attempts during lockout return `423 Locked` (not `401 Unauthorized`)
- Logged as a security audit event (`ACCOUNT_LOCKOUT`)

**Configuration:**

- `BRUTE_FORCE_MAX_ATTEMPTS` — failed attempts before lockout (default: 5)
- `BRUTE_FORCE_WINDOW_DURATION` — rolling window for counting attempts in seconds (default: 900 = 15 minutes)
- `BRUTE_FORCE_LOCKOUT_DURATION` — lockout duration in seconds (default: 900 = 15 minutes)

**Client Behavior:**

1. Retry in `lockoutTimeLeft` seconds
2. Or display a user-friendly message: "Your account is locked for XX minutes due to repeated failed login attempts"
3. Optionally offer password reset or support contact link

---

### 429 Too Many Requests — Rate Limit Exceeded

**Endpoints:** All authentication endpoints (`/auth/login`, `/auth/signup`, `/auth/refresh`, `/auth/verify-email`, etc.)

**Response Body:**

```json
{
  "statusCode": 429,
  "message": "Too Many Requests",
  "error": "Too Many Requests",
  "retryAfter": 60,
  "requestId": "f47ac10b-58cc-4372-a567-0e02b2c3d479"
}
```

**Fields:**

- `statusCode` — HTTP status code (429)
- `message` — Standard message
- `error` — Error type
- `retryAfter` — Recommended retry delay in seconds (optional)
- `requestId` — Request correlation ID

**Rate Limiting Configuration:**

The app enforces tiered throttling for authentication:

| Tier | Endpoint | Limit | Window |
|------|----------|-------|--------|
| `auth` | Generic auth operations | 10 requests | 60 seconds |
| `authStrict` | Login, signup, refresh, password reset, OTP verify | **5 requests** | **60 seconds** |
| `emailVerify` | Email verification requests | 3 requests | 3600 seconds (1 hour) |

**Example Scenario:**

User attempts login 6 times within 60 seconds:

1. Attempts 1-5: Success (proceed to auth logic)
2. Attempt 6: Return `429 Too Many Requests`
3. After 60 seconds elapse: Counter resets, next request is allowed

**Client Behavior:**

1. Observe `retryAfter` header or response field
2. Implement exponential backoff
3. Display user-friendly message: "Too many requests. Please try again in XX seconds."

---

## Composite Decorators for Route Protection

### @Auth() — Protected Route (JWT Required)

Applies `JwtAuthGuard` and Swagger documentation automatically.

**Usage:**

```typescript
@Controller('clips')
@Auth()
export class ClipsController {
  @Get()
  async getClips(@Req() req: any) {
    const userId = req.user.sub; // Extracted from JWT
    // ...
  }
}
```

**Behavior:**

- Validates JWT from `Authorization: Bearer <token>` header
- Enforces email verification (`emailVerified === true`)
- Attaches decoded JWT payload to `req.user`
- Returns `401 Unauthorized` if token is missing, invalid, expired, or email not verified
- Allows routes marked with `@Public()` to bypass the guard

**Swagger Documentation:**

- Automatically adds `@ApiBearerAuth('access-token')`
- Indicates the route requires authentication

---

### @Public() — Public Route (No Authentication Required)

Marks a route as publicly accessible, bypassing `JwtAuthGuard`.

**Usage:**

```typescript
@Post('login')
@Public()
@HttpCode(HttpStatus.OK)
async login(@Body() loginDto: LoginDto): Promise<AuthResponseDto> {
  // ...
}
```

**Routes Marked as Public:**

- `/auth/login` — Email/password authentication
- `/auth/signup` — User registration
- `/auth/forgot-password` — Password recovery
- `/auth/reset-password` — Password reset
- `/auth/verify-email` — Email verification
- `/auth/magic-link` — Magic link authentication
- Webhook endpoints
- Health check endpoints

---

### @Admin() — Admin-Only Route (Admin Secret Required)

Applies both `JwtAuthGuard` and `AdminGuard`.

**Usage:**

```typescript
@Controller('admin')
@Admin()
export class AdminController {
  @Get('users')
  async listUsers() {
    // ...
  }
}
```

**Behavior:**

- Validates JWT (same as `@Auth()`)
- Requires `x-admin-secret` header matching `ADMIN_SECRET` environment variable
- Returns `403 Forbidden` if header is missing or invalid

**Swagger Documentation:**

- Shows route requires bearer token AND admin secret

---

## JWT Payload Structure

**Issued by:** `AuthService.issueTokens()`

**Verified by:** `JwtStrategy`

**Claims:**

```typescript
interface JwtPayload {
  sub: number;           // User ID
  email: string | null;  // User email
  emailVerified: boolean; // Email verification status
  iat?: number;          // Issued at (standard JWT)
  exp?: number;          // Expires at (standard JWT)
}
```

**Configuration:**

- **Secret:** `process.env.JWT_SECRET` (default: `'dev_jwt_secret'`)
- **Expiration:** `process.env.JWT_EXPIRES` seconds (default: `3600` / 1 hour)
- **Signing Algorithm:** HS256 (HMAC-SHA256)

---

## Device Fingerprinting for Refresh Token Binding

When a user logs in or refreshes their token, the server captures device metadata:

1. **User Agent** — Parsed to extract OS, browser, version
2. **IP Address** — From `x-forwarded-for` (proxy) or `req.socket.remoteAddress`
3. **Platform** — Derived from user agent (Windows, macOS, Linux, etc.)
4. **Browser** — Derived from user agent (Chrome, Firefox, Safari, etc.)
5. **Device Fingerprint** — SHA-256 hash of (userAgent + ipAddress + platform)

**Use Cases:**

- **Refresh Token Validation:** On `POST /auth/refresh`, the device fingerprint is re-computed and compared to the original. A mismatch indicates a potential session hijack.
- **Security Audit:** Device info is logged alongside authentication events for forensics.
- **Multi-Device Support:** Each device gets its own refresh token; tokens are device-specific.

**Fingerprint Mismatch Behavior:**

```
User logs in from Device A (IP 192.0.2.1, Chrome)
  → Fingerprint stored: hash(userAgent + "192.0.2.1" + "Windows")
  → Refresh token issued

User attempts to refresh from Device B (IP 198.51.100.1, Firefox)
  → Fingerprint computed: hash(userAgent + "198.51.100.1" + "Windows")
  → Mismatch detected: possible session hijack
  → All refresh tokens revoked for user
  → Response: 401 Unauthorized (SESSION_HIJACK_DETECTED)
```

---

## Security Audit Logging

All authentication events are logged with security context:

### Authentication Success

```json
{
  "event": "AUTH_SUCCESS",
  "userId": 42,
  "email": "user@example.com",
  "method": "POST",
  "path": "/auth/login",
  "statusCode": 200,
  "ipAddress": "192.0.2.1",
  "requestId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "device": {
    "userAgent": "Mozilla/5.0...",
    "platform": "Windows",
    "browser": "Chrome 120.0"
  },
  "timestamp": "2024-03-13T12:00:00Z"
}
```

### Authentication Failure

```json
{
  "event": "AUTH_FAILURE",
  "email": "user@example.com",
  "method": "POST",
  "path": "/auth/login",
  "statusCode": 401,
  "errorCode": "INVALID_CREDENTIALS",
  "ipAddress": "192.0.2.1",
  "requestId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "timestamp": "2024-03-13T12:00:00Z"
}
```

### Account Lockout

```json
{
  "event": "ACCOUNT_LOCKOUT",
  "email": "user@example.com",
  "method": "POST",
  "path": "/auth/login",
  "statusCode": 423,
  "failedAttempts": 5,
  "lockoutDuration": 900,
  "ipAddress": "192.0.2.1",
  "requestId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "timestamp": "2024-03-13T12:00:00Z"
}
```

### Rate Limit Exceeded

```json
{
  "event": "RATE_LIMIT_EXCEEDED",
  "method": "POST",
  "path": "/auth/login",
  "statusCode": 429,
  "ipAddress": "192.0.2.1",
  "requestId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "timestamp": "2024-03-13T12:00:00Z"
}
```

---

## Swagger Examples

### Login Endpoint (Protected)

```typescript
@Post('login')
@Public()
@HttpCode(HttpStatus.OK)
@ApiOperation({
  summary: 'Login with email and password',
  description: '...'
})
@ApiBody({ type: LoginDto })
@ApiResponse({
  status: 200,
  type: AuthResponseDto,
  description: 'Successfully authenticated'
})
@ApiResponse({
  status: 401,
  type: UnauthorizedErrorDto,
  description: 'Invalid credentials or unverified email'
})
@ApiResponse({
  status: 423,
  type: LockedErrorDto,
  description: 'Account locked after repeated failed attempts'
})
@ApiResponse({
  status: 429,
  type: TooManyRequestsErrorDto,
  description: 'Rate limit exceeded'
})
async login(@Body() loginDto: LoginDto): Promise<AuthResponseDto> {
  // ...
}
```

### Protected Endpoint Example (NFT Mint)

```typescript
@Post('prepare-mint')
@Auth()  // Automatically applies JwtAuthGuard and @ApiBearerAuth()
@UseGuards(NftMintGuard)
@HttpCode(HttpStatus.CREATED)
@ApiOperation({
  summary: 'Prepare NFT mint transaction'
})
@ApiResponse({
  status: 201,
  description: 'Mint transaction prepared'
})
@ApiUnauthorizedResponse({
  description: 'Invalid or missing JWT token'
})
@ApiForbiddenResponse({
  description: 'User does not own the clip'
})
@ApiTooManyRequestsResponse({
  description: 'Minting rate limit exceeded (5 per 60 seconds)'
})
async prepareMint(@Req() req: any, @Body() dto: MintNftDto) {
  const userId = req.user.sub; // From JWT
  // ...
}
```

---

## Migration Checklist for Existing Endpoints

For any protected endpoint that previously lacked Swagger documentation:

- [ ] Apply `@Auth()` decorator to the controller or method
- [ ] Ensure `@ApiResponse({ status: 200, ... })` documents success
- [ ] Add `@ApiUnauthorizedResponse()` for missing/invalid JWT
- [ ] Add `@ApiForbiddenResponse()` if endpoint checks ownership
- [ ] Add `@ApiTooManyRequestsResponse()` for rate-limited endpoints
- [ ] Verify `req.user` contains the JWT payload (sub, email, emailVerified)
- [ ] Update controller imports to use new auth decorators from `src/auth`

---

## References

- SECURITY.md — Full security policy and best practices
- src/auth/ — Authentication module source code
- src/testing/authenticated-request.util.ts — Testing utilities for authenticated endpoints
- src/main.ts — Global setup including JWT strategy configuration and Swagger setup
