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
| `POST /videos/upload` | 5 active jobs per user | rolling |
| `POST /nft/mint` | 5 active jobs per user | rolling |
| `POST /nft/batch-mint` | 5 active jobs per user | rolling |
| `POST /nft/prepare-mint` | 5 active jobs per user | rolling |
| `POST /nft/enqueue-mint` | 5 active jobs per user | rolling |

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

## Queue Job Limits

Clip-generation and NFT-mint jobs are additionally limited **per user** to prevent a
single account from flooding a processing queue. The counter is stored in Redis under
the key `queue:ratelimit:<queue>:user:<userId>` and reset automatically when the
sliding window expires.

When the limit is exceeded the endpoint returns `429 Too Many Requests`, sets the
`Retry-After` header to the number of seconds until the window resets, and returns a
body identifying the queue and limit:

```json
{
  "statusCode": 429,
  "message": "Too many active jobs for queue \"clip-generation\". Maximum 5 jobs per user per 3600s window.",
  "queue": "clip-generation",
  "limit": 5,
  "windowSecs": 3600,
  "retryAfter": 60
}
```

If Redis is unavailable the guard fails open (the request is allowed) so a Redis
outage cannot block all job submissions.

### Queue environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `BULLMQ_<QUEUE>_MAX_JOBS_PER_USER` | `5` | Maximum active jobs per user for the queue |
| `BULLMQ_<QUEUE>_RATE_WINDOW_SECS` | `3600` | Sliding-window length in seconds |

`<QUEUE>` is the queue name uppercased with hyphens replaced by underscores, e.g.
`clip-generation` → `BULLMQ_CLIP_GENERATION_MAX_JOBS_PER_USER` /
`BULLMQ_CLIP_GENERATION_RATE_WINDOW_SECS`, and `nft-mint` →
`BULLMQ_NFT_MINT_MAX_JOBS_PER_USER`.

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
