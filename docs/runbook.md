# Maintainer Runbook

Operational reference for deploying, monitoring, and recovering the ClipCash backend.

---

## Deployment

### Prerequisites

- Node.js 18+, npm 9+
- PostgreSQL 14+ and Redis 7+ running (see Docker section)
- `.env` populated from `.env.example`

### Steps

```bash
# 1. Pull latest code
git pull origin main

# 2. Install dependencies
npm install

# 3. Apply database migrations
npx prisma migrate deploy

# 4. Build
npm run build

# 5. Start
npm run start:prod
```

### Docker (recommended for local / staging)

```bash
docker compose up -d        # starts PostgreSQL + Redis
npm run start:dev           # hot-reload dev server
```

### Environment checklist

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `REDIS_HOST` / `REDIS_PORT` | ✅ | BullMQ + cache |
| `JWT_SECRET` | ✅ | Min 32 chars |
| `ENCRYPTION_SECRET` | ✅ | Min 32 chars |
| `STELLAR_NETWORK` | ✅ | `testnet` or `public` |
| `SOROBAN_NFT_CONTRACT_ID` | ✅ | Deployed contract ID |
| `CLOUDINARY_*` | ✅ | Cloud name, API key/secret |
| `AYRSHARE_API_KEY` | ✅ | Social posting |
| `PINATA_JWT` | ✅ | IPFS metadata upload |
| `WEBHOOK_SECRET` | ✅ | Stellar payment webhooks |
| `METRICS_TOKEN` | ✅ | Protects `/metrics` endpoint |

### Rollback

```bash
# Revert to previous release tag
git checkout <previous-tag>
npm install
npx prisma migrate deploy
npm run build && npm run start:prod
```

To revert a migration (dev/staging only — never against production without backup):

```bash
npx prisma migrate reset   # ⚠️ destroys all data
```

---

## Monitoring

### Health check

```
GET /health
```

Returns status of the API, database, and Redis. Expect `200 { status: "ok" }` when healthy.

### Metrics

Prometheus-compatible metrics are exposed at:

```
GET /metrics
x-metrics-token: <METRICS_TOKEN>
```

Key gauges and counters:

| Metric | Description |
|---|---|
| `clipcash_clips_generated_total{status}` | Clip generation success / failure count |
| `clipcash_nft_mints_total{status}` | NFT mint success / failure count |
| `clipcash_job_queue_depth{queue}` | Current depth of each BullMQ queue |
| `clipcash_http_request_duration_seconds` | HTTP latency by method / route / status |
| `clipcash_stellar_rpc_errors_total` | Soroban RPC failures |
| `clipcash_cloudinary_upload_errors_total` | Cloudinary upload failures |

### Logs

Structured JSON logs are emitted to stdout. Each log line includes a `requestId` for tracing a request end-to-end. Pipe to your log aggregator (e.g. CloudWatch, Datadog, Loki).

### Alerts to set up

- `clipcash_job_queue_depth{queue="clip-generation"} > 100` — queue backing up
- `rate(clipcash_clips_generated_total{status="failure"}[5m]) > 0.1` — high clip failure rate
- `rate(clipcash_stellar_rpc_errors_total[5m]) > 0.05` — Soroban RPC degraded
- `/health` returning non-200 for > 30 s

---

## Queue Recovery

ClipCash uses BullMQ backed by Redis. All queues:

| Queue | Processor | Retry |
|---|---|---|
| `clip-generation` | `ClipGenerationProcessor` | 3×, exponential backoff from 1 s |
| `nft-mint` | `NftMintProcessor` | 3×, exponential backoff from 2 s |
| `clip-posting` | `ClipPostingProcessor` | 3× |
| `email-delivery` | `EmailDeliveryProcessor` | 3× |
| `payout-retry` | `PayoutRetryProcessor` | 3× |
| `anomaly-detection` | `AnomalyDetectionProcessor` | 3× |

### Inspecting failed jobs

```bash
# List failed jobs for a queue
GET /jobs/failed?type=clip-generation

# Inspect a specific job (includes failedReason + stacktrace)
GET /jobs/:id
```

### Retrying a failed job

```bash
POST /jobs/:id/retry
```

### Bulk retry (all failed in a queue)

```bash
# Via queue dashboard endpoint
GET /queue-dashboard/queues          # list queue stats
POST /queue-dashboard/retry-all      # retry all failed jobs
```

### Jobs stuck in `waiting`

1. Verify Redis is reachable: `redis-cli ping`
2. Check `REDIS_HOST` / `REDIS_PORT` in `.env`
3. Check worker process logs for startup errors
4. Restart the API / worker process

### Clearing the rate-limit counter for a user

If a user is blocked by the per-queue rate limit (HTTP 429):

```bash
redis-cli DEL "queue:ratelimit:clip-generation:user:{userId}"
```

The counter resets automatically after 1 hour.

### Soroban circuit breaker open

The `nft-mint` queue uses a circuit breaker. If mints are failing immediately:

```bash
# Check circuit state
GET /circuit-breaker/status

# Wait 30 s for automatic recovery, or force reset via Redis
redis-cli DEL "circuit-breaker:soroban-nft-mint"
```

---

## Incident Response

### P1 — API completely down

1. Check `/health` from an external monitor.
2. SSH to the host; check process status (`pm2 list` or `systemctl status clips-backend`).
3. Tail logs: `pm2 logs clips-backend` or `journalctl -u clips-backend -f`.
4. Common causes:
   - Database unreachable → check `DATABASE_URL` and PostgreSQL status.
   - Redis unreachable → check `REDIS_HOST/PORT` and Redis status.
   - OOM → check memory, scale up or reduce `BULLMQ_*_CONCURRENCY`.
5. Restart: `pm2 restart clips-backend` or `systemctl restart clips-backend`.

### P2 — Clip generation failing

1. Check `clipcash_clips_generated_total{status="failure"}` in Prometheus.
2. Inspect failed jobs: `GET /jobs/failed?type=clip-generation`.
3. Common causes:
   - FFmpeg not installed / wrong path → `which ffmpeg` on host.
   - Cloudinary credentials invalid → check `CLOUDINARY_*` env vars and test upload manually.
   - Input video URL unreachable → verify source URL accessibility from the host.
4. After fixing the root cause, retry failed jobs: `POST /jobs/:id/retry`.

### P3 — NFT minting failing

1. Check `clipcash_nft_mints_total{status="failure"}` and `clipcash_stellar_rpc_errors_total`.
2. Inspect failed jobs: `GET /jobs/failed?type=nft-mint`.
3. Common causes:
   - Soroban RPC outage → check [Stellar status page](https://status.stellar.org).
   - Wrong `SOROBAN_NFT_CONTRACT_ID` → verify against deployed contract on-chain.
   - Circuit breaker open → see [Soroban circuit breaker](#soroban-circuit-breaker-open) above.
4. Retry after confirming RPC is healthy.

### P4 — Payout failures

1. Check `GET /payouts` for payouts with `status: "failed"`.
2. Check `payout-retry` queue: `GET /jobs/failed?type=payout-retry`.
3. Common causes:
   - Insufficient platform XLM balance → top up the platform wallet.
   - Soroban / Horizon RPC error → check Stellar status.
   - Amount below `MIN_STELLAR_PAYOUT` threshold → user must request a higher amount.
4. Admin can re-trigger failed payouts via `POST /admin/payouts/:id/retry`.

### P5 — Social posting failures

1. Check `GET /jobs/failed?type=clip-posting`.
2. Common causes:
   - Ayrshare API key invalid / expired → rotate `AYRSHARE_API_KEY`.
   - Platform-specific posting limits → review Ayrshare dashboard for rate limit errors.
3. Retry: `POST /jobs/:id/retry`.

### Escalation contacts

Update the table below with your team's actual on-call contacts before deploying to production.

| Area | Owner |
|---|---|
| Infrastructure / DB / Redis | _ops-team@example.com_ |
| API / Backend | _backend-team@example.com_ |
| Stellar / NFT | _blockchain-team@example.com_ |
| Social posting (Ayrshare) | _integrations-team@example.com_ |

---

## Useful Commands Reference

| Command | Description |
|---|---|
| `npm run start:dev` | Dev server with hot reload |
| `npm test` | Unit tests |
| `npm run test:e2e` | End-to-end tests |
| `npm run lint` | ESLint |
| `npx prisma studio` | Browse / edit database via GUI |
| `npx prisma migrate deploy` | Apply pending migrations (production-safe) |
| `redis-cli monitor` | Real-time Redis command stream (use sparingly in prod) |
| `GET /health` | API + DB + Redis health check |
| `GET /metrics` | Prometheus metrics (requires `x-metrics-token`) |
| `GET /jobs/failed?type=<queue>` | List failed BullMQ jobs |
| `POST /jobs/:id/retry` | Retry a single failed job |
