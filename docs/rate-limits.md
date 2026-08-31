# Rate Limiting

ClipCash applies rate limiting to all API endpoints using `@nestjs/throttler` backed by Redis.

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
| `THROTTLE_TTL` | `60` | Rate limit window in seconds |
| `THROTTLE_LIMIT` | `100` | Maximum requests per window |
