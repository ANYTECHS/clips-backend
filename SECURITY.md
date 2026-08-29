# Security Best Practices

This document is the source-of-truth for security practices in the ClipCash backend. It is intended to guide contributors as they add or modify API routes, background jobs, wallet flows, and realtime connections.

This project already applies several protections in code, including:

- JWT-based HTTP authentication with email-verification gating
- multi-factor authentication (MFA/TOTP) support
- CSRF protection for cookie-authenticated state-changing requests
- brute-force / account-lockout protection for login attempts
- rate limiting with the Nest throttler (Redis-backed, shared across instances)
- Helmet security headers
- explicit CORS configuration
- global request validation
- AES-256-GCM encryption for sensitive values
- socket authentication checks for websocket gateways
- security audit logging and request correlation IDs
- stack-trace stripping from all error responses

All new endpoints and integrations should follow the same standards described here. The implementation and the Swagger/OpenAPI contract are the expected security baseline for day-to-day development.

## API security contract

Every protected endpoint must follow the same contract:

- Require authentication at the server boundary, not only in the client.
- Use the existing JWT auth guard or a stricter guard for ownership- or role-scoped requests.
- Return standard `401 Unauthorized` for missing/invalid/expired credentials.
- Return standard `403 Forbidden` for authenticated-but-not-authorized access.
- Return standard `429 Too Many Requests` when a rate limit is exceeded.
- Mark protected routes in Swagger with `@ApiBearerAuth('access-token')` and the relevant `@ApiUnauthorizedResponse`, `@ApiForbiddenResponse`, and `@ApiTooManyRequestsResponse` decorators.
- Apply validation and ownership checks before business logic.
- Keep secrets out of logs, responses, and exception payloads.

---

## 1. Authentication and authorization

### JWT handling

The backend uses JWT access tokens for authenticated API requests. The JWT strategy is configured in `src/auth/strategies/jwt.strategy.ts` and the app issues tokens from `src/auth/auth.service.ts`.

Signing configuration is in `src/auth/auth.module.ts` and is driven by environment variables from `.env.example`:

- `JWT_SECRET` — secret used to sign access tokens. Defaults to a dev-only value; production must set a strong secret.
- `JWT_EXPIRES` — access-token lifetime in **seconds** (default `3600` / 1 hour).

JWT claims (see `AuthService.issueTokens`):

- `sub` — the authenticated user id
- `email` — the user's email, if any
- `emailVerified` — boolean; `false` blocks access per the strategy

Required rules:

- Use `Authorization: Bearer <accessToken>` for authenticated REST requests.
- Access tokens must be signed with `JWT_SECRET` and expire according to `JWT_EXPIRES`.
- Do not accept unsigned or malformed tokens.
- Reject tokens when the user has not verified their email (`emailVerified === false`) — enforced in `JwtStrategy.validate`.
- Never log raw JWTs, refresh tokens, or authorization headers.
- Do not embed sensitive secrets, private wallet keys, PII, or role identifiers in JWT claims.
- Set `expiresIn` on the signing options so tokens cannot live indefinitely.

Refresh tokens:

- Refresh tokens are stored as opaque random values and hashed with SHA-256 before persistence.
- Tokens are bound to device metadata such as user agent hash and IP when available (`DeviceFingerprintService`, `src/auth/device-fingerprint.service.ts`).
- Refresh uses **rotation**: each call to `AuthService.refreshTokens` revokes the previous token (`revokedAt`) and issues a new pair. On a device-fingerprint mismatch the service revokes **all** of the user's outstanding refresh tokens and rejects the request with `401 Unauthorized` (potential session-hijack detection).
- Expired, revoked, or already-used refresh/magic-link tokens must be rejected.
- Refresh/magic-link/password-reset tokens are single-use: a `usedAt` timestamp marks them consumed.

MFA / TOTP:

- Accounts may opt in to TOTP two-factor authentication via `speakeasy`.
- `AuthService.setupMfa` generates a base32 secret and QR code; `enableMfa` verifies a submitted code before flipping `mfaEnabled`; `disableMfa` clears the secret.
- On login, when `mfaEnabled` is true, a valid TOTP code (`dto.totpCode`) is required and verified with a verification window of one step. Invalid codes yield `401 Unauthorized`.
- MFA secrets are stored encrypted at rest through the encryption service and must never appear in responses or logs.

When adding a protected route:

- Use the existing auth guard and decorator patterns.
- Mark the endpoint in Swagger with `@ApiBearerAuth('access-token')`.
- Return standard `401 Unauthorized` when the JWT is missing, invalid, or expired.

### Wallet authentication

The backend supports wallet-based ownership validation for blockchain actions. This is used to verify that a client controls a wallet address before allowing sensitive actions such as NFT mint authorization or wallet-linked actions.

Implementation expectations:

- Verify wallet signatures against the public key corresponding to the wallet address.
- Validate that the signed message is the expected challenge or canonical message for that endpoint.
- Reject malformed addresses, malformed signatures, or mismatched public keys.
- Do not trust a wallet address without proving ownership via signed challenge verification.

Multi-chain support (`src/wallets/wallet-validation.service.ts`):

- Stellar — Ed25519 public keys verified via `@stellar/stellar-sdk` `Keypair.fromPublicKey().verify()`.
- Solana — base58-encoded 32–44 byte Ed25519 addresses, format-validated.
- Base / EVM — `0x`-prefixed 40-character hex addresses.
- Use `validateAddressForChain(address, chain)` to validate the correct format for the active chain.

Examples in this codebase:

- `src/wallets/wallet-validation.service.ts` verifies Stellar Ed25519 signatures and validates Stellar, Solana, and EVM address formats.
- `src/nft/mint-signature-verification.service.ts` verifies signed mint authorization challenges.

Security rules for wallet operations:

- The server must not require private keys from clients.
- The signature must be checked on the server using the public key.
- Challenge strings should be deterministic and specific to the action being authorized (e.g. `ClipCash mint authorization for clip <clipId> by <walletAddress>`).
- Any wallet callback or signature verification must reject invalid payloads with `400 Bad Request` or `401 Unauthorized`, not silent success.
- Replay protection: the canonical mint challenge is deterministic and therefore vulnerable to replay. Before mainnet launch, extend `MintSignatureVerificationService` with a short-lived nonce (the code comment at `src/nft/mint-signature-verification.service.ts` recommends storing a nonce in Redis) so each authorization can only be consumed once.

Wallet ownership guards:

- `src/wallets/guards/wallet-ownership.guard.ts` and `src/nft/guards/nft-ownership.guard.ts` / `nft-mint.guard.ts` enforce ownership server-side. Apply these guards to any route where the caller claims a wallet or token owner.

### Authorization requirements

Authorization is evaluated separately from authentication. A user may be authenticated but still not allowed to perform a sensitive action.

Required patterns:

- Use ownership guards or role checks before mutating records owned by another user.
- Check business ownership before allowing wallet, payout, NFT, clip, or admin actions.
- Return `403 Forbidden` when the caller is authenticated but not allowed to perform the action.
- Prefer server-side ownership validation over trusting client-provided IDs.

Sensitive flows in this project include:

- wallet ownership checks
- clip ownership checks
- payout approvals
- admin-only routes
- protected revenue management

---

## 2. Rate limiting and abuse protection

Rate limiting is enforced centrally through Nest throttler configuration in `src/app.module.ts`.

### Default rules

The app defines throttlers for:

- default
- auth
- authStrict
- sensitive
- emailVerify
- clipGenerate
- nftMint
- walletConnect
- walletDisconnect
- transactionSend

Example limits from the current implementation:

- default: 100 requests / 60 seconds
- auth: 10 requests / 60 seconds
- authStrict: 5 requests / 60 seconds
- sensitive: 3 requests / 15 minutes
- emailVerify: 3 requests / 60 minutes
- nftMint: 5 requests / 60 seconds
- transactionSend: 5 requests / 60 seconds

### Required practices

- Apply stricter limits to authentication, wallet, and transaction-heavy endpoints.
- Add `@Throttle(...)` to endpoints that trigger expensive or sensitive actions.
- Use the existing names and tiers instead of inventing ad hoc limits without reason.
- Reserve admin and internal endpoints for trusted networks or explicit allowlisting.
- Respect `THROTTLER_WHITELIST` for trusted IP addresses when needed.

### Brute-force protection / account lockout

Login attempts are tracked server-side by `BruteForceProtectionService` (`src/auth/brute-force-protection.service.ts`) using Redis, and gated by `BruteForceGuard` (`src/auth/guards/brute-force.guard.ts`).

Default configuration:

- `BRUTE_FORCE_MAX_ATTEMPTS` — failed attempts before lockout (default `5`).
- `BRUTE_FORCE_WINDOW_DURATION` — rolling window for counting attempts (default `900`s).
- `BRUTE_FORCE_LOCKOUT_DURATION` — lockout duration (default `900`s).

Behaviour:

- Each failed login records an attempt; the Nth failure locks the account for the lockout duration.
- While locked, login for that email returns `423 Locked` with body `{ "error": "ACCOUNT_LOCKED", "lockoutTimeLeft": <seconds>, ... }`.
- The `SecurityAuditFilter` logs `ACCOUNT_LOCKOUT` security events for these responses.
- Successful login clears all failed attempts for the user.
- **Fail-open design**: if Redis is unavailable, the service bypasses lockout (does not block login). This is a deliberate availability trade-off — monitor Redis health and the `Redis unavailable — brute-force protection bypassed` log warnings.

Apply the `BruteForceGuard` interceptor (or the brute-force check inside `AuthService.login`) to any credential-check endpoint to prevent password guessing and credential stuffing.### Rate-limit responses

When the request exceeds the configured limit, the API responds with:

- `429 Too Many Requests`
- standard Nest throttler error body

Example response:

```json
{
  "statusCode": 429,
  "message": "ThrottlerException: Too Many Requests",
  "error": "Too Many Requests"
}
```

Swagger notes:

- Mark rate-limited endpoints with `@ApiTooManyRequestsResponse(...)` where relevant.
- Document the expected retry pattern (exponential backoff, respect `Retry-After`/rate-limit headers when available).

---

## 3. Security headers and browser protection

The app configures Helmet in `src/main.ts` before routes are registered.

### Enabled protections

Current implementation includes:

- `Content-Security-Policy`
- `Strict-Transport-Security`
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: no-referrer`
- `hidePoweredBy` removal
- `frameguard` denial

The app also disables `x-powered-by` explicitly and sets `Cache-Control: no-store` for non-API docs routes.

### Required practices

- Do not disable Helmet without a documented reason.
- Keep CSP restrictive for production.
- Allow Swagger UI inline scripts only when the docs are intentionally enabled.
- Avoid introducing untrusted inline scripts or active content in API responses.
- Never expose raw secrets in rendered HTML or documentation output.

---

## 4. CORS policy

CORS is configured in `src/main.ts` with `app.enableCors(buildCorsOptions(...))`.

Current behavior:

- No wildcard origin is used in the production allow-list logic.
- Development defaults allow localhost origins.
- Production accepts only origins defined in `ALLOWED_ORIGINS`.
- Methods and headers are explicitly controlled via environment variables.

Required practices:

- Keep `ALLOWED_ORIGINS` explicit and environment-driven.
- Do not allow `*` for credentialed browser requests.
- Only expose the headers required by the frontend and API consumers.
- Prefer origin allow-listing over permissive cross-origin configurations.

### CSRF protection

State-changing requests (`POST`, `PUT`, `PATCH`, `DELETE`) that are authenticated via session/cookies must also carry a CSRF token. The guards live in `src/csrf/`:

- `CsrfService` (`src/csrf/csrf.service.ts`) generates a 32-byte random token, sets it as the `_csrf` cookie, and validates token equality.
- `CsrfGuard` (`src/csrf/csrf.guard.ts`) and the inline middleware in `CsrfModule.configure` (`src/csrf/csrf.module.ts`) enforce the check on every non-`GET/HEAD/OPTIONS` request.

Required practices:

- Read the token from the `_csrf` cookie and compare it against `X-CSRF-Token` (header) or `_csrf` (body field).
- Skip CSRF for `GET`/`HEAD`/`OPTIONS` requests only.
- Skip CSRF for unauthenticated flows where no session is established: `/auth/signup`, `/auth/login`, `/auth/magic-link`, `/auth/verify-magic`, `/auth/verify-email`, `/auth/forgot-password`, `/auth/reset-password`, `/auth/google*`, `/api`, and any request presenting an `X-API-Key` header (API-key auth is not vulnerable to the same cookie-based CSRF vector).
- When a CSRF token is missing or does not match, respond `403 Forbidden` with `{ "message": "Invalid CSRF token" }`.
- The `_csrf` cookie is `SameSite=Strict`, `secure` in production, and `HttpOnly: false` so the SPA can read it and send it back in a header.

For authenticated browser clients, the login response must issue the `_csrf` cookie via `CsrfService.setCsrfCookie`.

---

## 5. Input validation and safe payload handling

The application applies a global validation pipeline in `src/main.ts`:

```ts
new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
})
```

This means:

- unknown properties are stripped
- forbidden properties cause validation errors
- DTOs and types are transformed automatically where applicable

Required practices:

- Validate all request bodies, query params, and route params.
- Reject invalid IDs, invalid wallet addresses, invalid signatures, and malformed payloads.
- Use DTOs, not raw `req.body` handling, for public endpoints.
- Prefer integer parsing and type-safe validation over trusting client input.
- Reject overlong or unsafe string values before they reach business logic.

Examples in this project:

- `@Param('id', ParseIntPipe)`
- wallet address validation via `WalletValidationService`
- password strength validation via custom validators

---

## 6. Encryption and secret handling

### Encryption at rest

Sensitive data is encrypted using AES-256-GCM in `src/encryption/encryption.service.ts`.

Current implementation:

- Algorithm: `aes-256-gcm`
- Key derivation: SHA-256 of `ENCRYPTION_SECRET`
- Payload includes IV + auth tag + ciphertext
- Authentication tag is verified during decryption

This service is used for sensitive values such as:

- wallet secrets
- encrypted payout methods
- other persisted secret material

Required practices:

- Never store plaintext secrets in the database when they can be encrypted.
- Keep `ENCRYPTION_SECRET` in environment or secret manager configuration only.
- Rotate encryption keys according to the deployment lifecycle.
- Do not encrypt and then log the value or expose it in API responses.

### Secret management

Secrets must not be committed to source control.

Required environment variables include, but are not limited to:

- `JWT_SECRET`
- `ENCRYPTION_SECRET`
- database credentials
- cloud, email, and blockchain provider credentials
- webhook secrets

Guidance:

- Store secrets in the deployment environment or a managed secret store.
- Never hardcode production secrets in code or examples.
- Fail startup if required secret configuration is missing for critical services.
- Rotate secrets after suspected exposure and review logs for accidental leakage.

---

## 7. WebSocket security

The project includes realtime gateways for clip progress and video progress. These gateways validate JWTs before accepting a socket connection.

Examples:

- `src/clips/clips.gateway.ts`
- `src/videos/video-progress.gateway.ts`

Required practices:

- Require socket authentication on every connection for authenticated realtime streams.
- Accept a token only from the expected source: handshake auth, query param, or bearer Authorization header.
- Reject invalid or expired JWTs immediately and disconnect the socket.
- Scope events by user and room so one user cannot receive another user's progress updates.
- Keep CORS and origin restrictions tight for websocket gateways as well.

Examples from the current codebase:

- Socket connections verify JWTs before joining a room.
- `client.disconnect()` is used on invalid or missing authentication.
- Room names are user-scoped (for example `user:<userId>`).

### Gateway CORS configuration

- `src/clips/clips.gateway.ts` restricts origins to `ALLOWED_ORIGINS` (env-driven) with `credentials: true`.
- **Caution:** `src/videos/video-progress.gateway.ts` currently uses `cors: { origin: '*' }` with no origin allow-listing. This is acceptable only while the gateway emits non-sensitive, user-scoped progress events, but it should be tightened to the same `ALLOWED_ORIGINS` allow-list before any authenticated subscription data lands on this namespace. Any new gateway must use the explicit allow-list, never `'*'`.

---

## 8. Dependency and supply-chain security

The backend should be treated as a production system and dependency hygiene matters.

Required practices:

- Keep dependencies updated and patch known vulnerabilities promptly.
- Periodically review `npm audit` or equivalent security advisories.
- Prefer well-maintained packages and avoid unnecessary integrations.
- Review third-party packages before introducing them to critical authentication or wallet flows.
- Treat webhooks and external service callbacks as untrusted inputs unless explicitly verified.

Important: all secrets, token material, and sensitive callback payloads should be validated before being trusted by application logic.

---

## 9. Security audit logging, error handling, and request correlation

### Request correlation IDs

Every incoming HTTP request is assigned a correlation ID by `RequestIdMiddleware` (`src/logger/request-id.middleware.ts`) and attached to `req.requestId`.

- If the client/proxy supplies an `X-Request-Id` header it is reused; otherwise the API generates a UUID v4.
- The same ID is echoed back on the `X-Request-Id` response header and is appended to `requestId` in error response bodies.
- Logs (request start/complete, security events, 5xx errors) are all enriched with this `requestId` so a single value traces a full request lifecycle.
- `RequestLoggingInterceptor` (`src/common/interceptors/request-logging.interceptor.ts`) logs method, path, and duration only — never bodies, headers, or query parameters.

### Exception filtering and stack-trace removal

- `HttpExceptionLoggingFilter` (`src/common/filters/http-exception-logging.filter.ts`) is registered globally and is the last filter to shape a response. It deletes `stack` and `trace` from every error body so internal details are never leaked to clients.
- All error bodies include the `requestId` when available.
- `SecurityAuditFilter` (`src/common/filters/security-audit.filter.ts`) is also registered globally and inspects every `HttpException`, logging structured security events for:
  - `401` → `AUTH_FAILURE`
  - `403` → `PERMISSION_DENIED`
  - `429` → `RATE_LIMIT_EXCEEDED`
  - `423` with `error === 'ACCOUNT_LOCKED'` → `ACCOUNT_LOCKOUT`
- These audit log entries record method, path, IP, and `requestId` **without** request bodies or headers. Monitor this log stream for abuse or credential-stuffing patterns.

### Password handling

- Passwords are hashed with `bcrypt` (cost factor `10`) in `AuthService.signup`/`resetPassword` (`src/auth/auth.service.ts`). Never store or log plaintext passwords.
- Failed logins return generic `401 Unauthorized` ("Invalid credentials") whether or not the email exists, to prevent user enumeration. The message additionally reports remaining attempts; on lockout the account returns `423 Locked`.

---

## 10. Swagger and API integration requirements

The backend exposes the OpenAPI document in `src/main.ts` with `SwaggerModule` and configures bearer auth via `addBearerAuth`.

### Authentication requirements for Swagger

Protected endpoints should be explicitly marked as authenticated:

- `@ApiBearerAuth('access-token')`
- `@UseGuards(...)` or the project auth decorator for protected routes
- `@ApiUnauthorizedResponse({ description: 'Unauthorized' })`

Examples already used in controllers such as wallet, clips, earnings, payouts, and transactions. For admin-only routes, also document the privilege requirement with `@ApiForbiddenResponse({ description: 'Forbidden — admin access required' })`.

### Authorization requirements for Swagger

When an endpoint is restricted by role or ownership, document it with:

- `@ApiForbiddenResponse({ description: 'Forbidden' })`
- clear endpoint summaries explaining who is allowed to call it
- ownership and scope rules in the endpoint description
- guard names or business rules in the summary when they affect API behavior

### Rate-limit responses in Swagger

If an endpoint is rate-limited, add:

- `@ApiTooManyRequestsResponse({ description: 'Too Many Requests' })`

This helps API consumers understand that retry behavior is expected under abuse protection. Sensitive routes such as auth, wallet connection, and transaction submission must advertise the throttle limit in the API contract.

### Standard API errors

For public and protected endpoints, apply the standard response patterns:

- `400 Bad Request` — invalid payload or signature verification failure
- `401 Unauthorized` — missing or invalid auth credentials (JWT missing, invalid, or expired; unverified email)
- `403 Forbidden` — authenticated but not authorized; also returned for a missing/invalid CSRF token on browser-authenticated mutations
- `423 Locked` — account temporarily locked after repeated failed login attempts (`ACCOUNT_LOCKED`)
- `429 Too Many Requests` — throttled request

Representative response bodies:

```json
{
  "statusCode": 401,
  "message": "Unauthorized",
  "error": "Unauthorized"
}
```

```json
{
  "statusCode": 403,
  "message": "Forbidden",
  "error": "Forbidden"
}
```

```json
{
  "statusCode": 429,
  "message": "ThrottlerException: Too Many Requests",
  "error": "Too Many Requests"
}
```

Document the applicable responses on each endpoint with `@ApiBadRequestResponse`, `@ApiUnauthorizedResponse`, `@ApiForbiddenResponse`, `@ApiTooManyRequestsResponse`, etc.

### Contributor checklist for new endpoints

Before merging a new endpoint, verify that:

1. It has the correct auth mode documented in Swagger.
2. Protected endpoints use bearer auth metadata and/or guards.
3. Sensitive operations are rate-limited.
4. Authorization rules are enforced server-side, not only in the client.
5. `400`, `401`, `403`, and `429` cases are documented where relevant.
6. The endpoint does not log secrets or raw auth tokens.
7. Input validation and ownership checks are implemented before business logic.
8. If browser/cookie-authenticated, CSRF validation applies (see §4 CSRF protection).
9. Account-lockout and security-audit events are covered for auth flows (see §9).
10. Swagger marks the security scheme: `@ApiBearerAuth('access-token')` for bearer-protected routes; CSRF-bearing routes document the `X-CSRF-Token` header requirement.

---

## 11. Safe endpoint design checklist

When adding a new route, follow this checklist:

- Determine if the endpoint requires authentication.
- Determine if it is admin-only, owner-only, or user-scoped.
- Add the correct Nest guard(s).
- Add `@ApiBearerAuth(...)` and the relevant Swagger error responses.
- Add throttle protection for high-risk or expensive endpoints.
- Validate all input and reject malformed or unexpected values.
- Never trust client-provided ownership or wallet fields without verification.
- Keep secret values out of logs and API responses.
- Review the endpoint for CORS, cache, and security header implications.
- If browser-authenticated, ensure the CSRF middleware/guard covers it and clients send the `_csrf` token.
- Ensure error responses strip stack traces and carry the correlation/request ID.

---

## 12. Incident response and reporting

If a security issue is suspected:

- stop access to any compromised secret immediately
- rotate affected credentials and tokens
- review logs for leaked authorization data
- validate whether a wallet signature, JWT, or API credential was exposed
- report the issue through the project’s established security disclosure process, if available

Do not disclose private security details publicly without coordination.

---

## 13. Summary

The backend already implements a strong baseline for security, and contributors are expected to preserve and extend these controls. In practice, the most important rules are:

- protect APIs with JWT (and MFA/TOTP where enabled), email-verification gating, and authorization checks
- validate all inputs
- restrict CORS, add CSRF protection for cookie-authenticated mutations, and adopt strong headers
- enforce rate limiting and brute-force lockout on sensitive endpoints
- verify wallet ownership before trust
- encrypt secrets and avoid plaintext storage
- log security events with correlation IDs and never leak stack traces
- document real security guarantees in Swagger and contributor guidance

The commitment is simple: no endpoint should be considered safe unless authentication, authorization, validation, and rate limiting are all enforced by the server.
