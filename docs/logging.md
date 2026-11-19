# Logging Guide

ClipCash backend uses a consistent logging stack for observability and security.

## Approved loggers

| Context | Logger | When to use |
|---------|--------|-------------|
| Nest providers / services | `Logger` from `@nestjs/common` (`new Logger(ClassName.name)`) | Default for service, controller, gateway, and processor logs |
| Structured / security / HTTP | `AppLoggerService` (`src/logger/logger.service.ts`) | JSON production logs, redaction, correlation fields |
| CLI scripts | `console.*` | One-off CLI tools only (e.g. encryption migration) |

**Do not** use `console.log` / `console.error` inside Nest services, controllers, or Prisma middleware.

## Log levels

Controlled by `LOG_LEVEL` (default: `info`):

| Level | Numeric | Typical use |
|-------|---------|-------------|
| `error` | 0 | Failures that need attention |
| `warn` | 1 | Recoverable issues, security events |
| `info` / `log` | 2 | Request lifecycle, business milestones |
| `debug` | 3 | Detailed diagnostics |
| `verbose` | 4 | Very noisy traces |

Higher verbosity includes lower levels. Example: `LOG_LEVEL=warn` suppresses `info`/`debug`.

## Structured format

In production (`NODE_ENV=production`), `AppLoggerService` writes one JSON object per line:

```json
{
  "level": "info",
  "timestamp": "2026-08-29T06:00:00.000Z",
  "context": "HTTP",
  "message": "Request completed",
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "method": "GET",
  "path": "/videos/1",
  "statusCode": 200,
  "durationMs": 42
}
```

In development, the same fields are pretty-printed to the console.

## Correlation IDs

`RequestIdMiddleware` (`src/logger/request-id.middleware.ts`):

1. Reads `X-Request-Id` from the incoming request if present.
2. Otherwise generates a UUID v4.
3. Sets `req.requestId` and echoes `X-Request-Id` on the response.

`RequestLoggingInterceptor` logs request start/completion with `requestId`.
`HttpExceptionLoggingFilter` and `SecurityAuditFilter` attach `requestId` to error JSON bodies.

Clients should:

- Send `X-Request-Id` when propagating a trace from an upstream gateway.
- Capture the response `X-Request-Id` / body `requestId` for support tickets.

## Sensitive data policy

`AppLoggerService` redacts keys (case-insensitive):

- `password`, `token`, `accessToken`, `refreshToken`
- `privateKey`, `secret`, `mfaSecret`, `authorization`

Never log:

- Raw JWTs, API keys, Anthropic/Cloudinary secrets
- Full request/response bodies or Authorization headers
- Bank account / payout method ciphertext
- Wallet private keys

Prefer identifiers (`userId`, `videoId`, `payoutId`) over payloads.

## Error logging

- **4xx security events** (401/403/429/account lock): audited via `SecurityAuditFilter` at `warn` without bodies/headers.
- **5xx unexpected errors**: logged via `HttpExceptionLoggingFilter` with message + stack in logs only.
- **API responses**: never include `stack` or `trace`. Always prefer a stable `message` plus `requestId`.

## Swagger / API

See the **Correlation / Request IDs** section in Swagger (`/api/docs`). Error schemas may include `requestId`; they must not document internal stack traces as part of the public contract.
