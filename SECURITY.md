# Security Best Practices

This document summarizes the security controls and required practices for the ClipCash backend. It is intended to guide contributors as they add or modify API routes, background jobs, wallet flows, and realtime connections.

This project already applies several protections in code, including:

- JWT-based HTTP authentication
- rate limiting with the Nest throttler
- Helmet security headers
- explicit CORS configuration
- global request validation
- AES-256-GCM encryption for sensitive values
- socket authentication checks for websocket gateways

All new endpoints and integrations should follow the same standards described here.

---

## 1. Authentication and authorization

### JWT handling

The backend uses JWT access tokens for authenticated API requests. The JWT strategy is configured in `src/auth/strategies/jwt.strategy.ts` and the app issues tokens from `src/auth/auth.service.ts`.

Required rules:

- Use `Authorization: Bearer <accessToken>` for authenticated REST requests.
- Access tokens must be signed with `JWT_SECRET` and expire according to `JWT_EXPIRES`.
- Do not accept unsigned or malformed tokens.
- Reject tokens when the user has not verified their email (`emailVerified === false`).
- Never log raw JWTs, refresh tokens, or authorization headers.
- Do not embed sensitive secrets, private wallet keys, or PII in JWT claims.

Refresh tokens:

- Refresh tokens are stored as opaque random values and hashed with SHA-256 before persistence.
- Tokens are bound to device metadata such as user agent and IP when available.
- Expired or revoked refresh tokens must be rejected.

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

Examples in this codebase:

- `src/wallets/wallet-validation.service.ts` verifies Stellar public keys and address formats.
- `src/nft/mint-signature-verification.service.ts` verifies signed mint authorization challenges.

Security rules for wallet operations:

- The server must not require private keys from clients.
- The signature must be checked on the server using the public key.
- Challenge strings should be deterministic and specific to the action being authorized.
- Any wallet callback or signature verification must reject invalid payloads with `400 Bad Request` or `401 Unauthorized`, not silent success.

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

### Rate-limit responses

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

## 9. Swagger and API integration requirements

The backend exposes the OpenAPI document in `src/main.ts` with `SwaggerModule` and configures bearer auth via `addBearerAuth`.

### Authentication requirements for Swagger

Protected endpoints should be explicitly marked as authenticated:

- `@ApiBearerAuth('access-token')`
- `@UseGuards(...)` or the project auth decorator for protected routes
- `@ApiUnauthorizedResponse({ description: 'Unauthorized' })`

Examples already used in controllers such as wallet, clips, earnings, and payouts.

### Authorization requirements for Swagger

When an endpoint is restricted by role or ownership, document it with:

- `@ApiForbiddenResponse({ description: 'Forbidden' })`
- clear endpoint summaries explaining who is allowed to call it
- ownership and scope rules in the endpoint description

### Rate-limit responses in Swagger

If an endpoint is rate-limited, add:

- `@ApiTooManyRequestsResponse({ description: 'Too Many Requests' })`

This helps API consumers understand that retry behavior is expected under abuse protection.

### Standard API errors

For public and protected endpoints, apply the standard response patterns:

- `401 Unauthorized` — missing or invalid auth credentials
- `403 Forbidden` — authenticated but not authorized
- `429 Too Many Requests` — throttled request
- `400 Bad Request` — invalid payload or signature verification failure

### Contributor checklist for new endpoints

Before merging a new endpoint, verify that:

1. It has the correct auth mode documented in Swagger.
2. Protected endpoints use bearer auth metadata and/or guards.
3. Sensitive operations are rate-limited.
4. Authorization rules are enforced server-side, not only in the client.
5. `400`, `401`, `403`, and `429` cases are documented where relevant.
6. The endpoint does not log secrets or raw auth tokens.
7. Input validation and ownership checks are implemented before business logic.

---

## 10. Safe endpoint design checklist

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

---

## 11. Incident response and reporting

If a security issue is suspected:

- stop access to any compromised secret immediately
- rotate affected credentials and tokens
- review logs for leaked authorization data
- validate whether a wallet signature, JWT, or API credential was exposed
- report the issue through the project’s established security disclosure process, if available

Do not disclose private security details publicly without coordination.

---

## 12. Summary

The backend already implements a strong baseline for security, and contributors are expected to preserve and extend these controls. In practice, the most important rules are:

- protect APIs with JWT and authorization checks
- validate all inputs
- restrict CORS and adopt strong headers
- enforce rate limiting on sensitive endpoints
- verify wallet ownership before trust
- encrypt secrets and avoid plaintext storage
- document real security guarantees in Swagger and contributor guidance

The commitment is simple: no endpoint should be considered safe unless authentication, authorization, validation, and rate limiting are all enforced by the server.
