# Rate Limiting

ClipCash applies rate limiting to all API endpoints using `@nestjs/throttler` backed by Redis.
The global limit is 100 requests per minute per client IP. Configure the window and limit with
`RATE_LIMIT_TTL` (seconds) and `RATE_LIMIT_LIMIT` in `.env`.

## Global Defaults

| Window | Max Requests |
|--------|-------------|
| 60 seconds | 100 requests |

## Endpoint-Specific Limits

| Endpoint | Limit | Window |
|----------|-------|--------|
| `POST /auth/login` | 10 | 60 s |
| `POST /auth/signup` | 5 | 60 s |
| `POST /wallets/connect` | 10 | 60 s |
| `DELETE /wallets/:id` | 10 | 60 s |
| `GET /wallets/:id/balance` | 30 | 60 s |
| `POST /clips/generate` | 5 active jobs per user | rolling |
| `POST /clips/:id/regenerate` | 5 active jobs per user | rolling |

## Response When Limit Exceeded

When a rate limit is hit, the API returns `429 Too Many Requests`:

```json
{
  "statusCode": 429,
  "message": "ThrottlerException: Too Many Requests",
  "error": "Too Many Requests",
  "timestamp": "2026-08-29T16:50:25.156Z"
}
```

The `Retry-After` header indicates how many seconds to wait before retrying.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `RATE_LIMIT_TTL` | `60` | Rate limit window in seconds |
| `RATE_LIMIT_LIMIT` | `100` | Maximum requests per window |
| `THROTTLER_WHITELIST` | empty | Comma-separated client IPs that bypass throttling |
| `TRUST_PROXY` | `false` | Set to `true` behind one trusted reverse proxy to use the originating client IP |

The legacy `THROTTLE_DEFAULT_TTL` (milliseconds) and `THROTTLE_DEFAULT_LIMIT` variables remain
supported when their `RATE_LIMIT_*` replacements are unset. Route-level `@Throttle()` limits
continue to override the global limit for critical endpoints.
