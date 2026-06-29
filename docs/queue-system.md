# Queue System Documentation

## Overview

ClipCash uses [BullMQ](https://docs.bullmq.io/) backed by Redis for asynchronous job processing. This document explains the queue architecture, job flows, scaling strategies, and operational patterns.

**Key concepts:**
- Jobs are added to Redis-backed queues by services
- Workers (processors) compete for and execute jobs
- Failed jobs are retried with exponential backoff
- Multiple workers can scale horizontally without coordination

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         API Server                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐        │
│  │ Clip Gen │  │  NFT Mint│  │  Email   │  │ Payout   │        │
│  │Controller│  │Controller│  │Controller│  │Controller│        │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘        │
│       │             │             │             │               │
│       └─────────────┼─────────────┼─────────────┘               │
│                     │ (enqueue)                                  │
│                     ▼                                            │
│          ┌──────────────────────┐                               │
│          │   BullMQ Queue (in   │                               │
│          │   Redis)             │                               │
│          └──────────┬───────────┘                               │
│                     │ (reserve job)                             │
│                     ▼                                            │
│          ┌──────────────────────┐                               │
│          │   Processor Worker    │                              │
│          │  (executes job)       │                              │
│          └──────────┬───────────┘                               │
│                     │ (result/failure)                          │
│                     ▼                                            │
│          ┌──────────────────────┐                               │
│          │  Redis (completed /  │                              │
│          │  failed sets)         │                              │
│          └──────────────────────┘                               │
└─────────────────────────────────────────────────────────────────┘
```

---

## Queue Types and Job Flows

### 1. Clip Generation Queue

**Name:** `clip-generation`
**Purpose:** Process uploaded/imported videos into clips using FFmpeg
**Workers:** Can run 1-N instances with configurable concurrency

**Job Payload:**
```ts
{
  videoId: string;
  inputPath: string;
  outputPath: string;
  startTime: number;
  endTime: number;
  positionRatio: number;
  transcript?: string;
  title?: string;
  clipId?: number;
}
```

**Configuration:**
- Retry attempts: 3
- Backoff: Exponential, 1000ms initial delay
- User rate limit: Max 5 concurrent jobs per user per hour
- Processor: `ClipGenerationProcessor` (`src/clips/clip-generation.processor.ts`)

**Flow Diagram:**
```
POST /clips/generate
    │
    ▼
QueueRateLimitGuard (check Redis counter)
    │
    ├─ User over limit? ──► HTTP 429
    │
    └─ OK
        ▼
    ClipsService.enqueueClip()
        ▼
    BullMQ Queue (waiting)
        ▼
    ClipGenerationProcessor
        ├─ Run FFmpeg
        ├─ Upload to Cloudinary
        └─ Update DB status
        ▼
    WebSocket event to client (complete/failed)
```

**Failure Handling:**
- Failed jobs retry up to 3 times with exponential backoff
- After 3 failures, job moves to failed set
- Can be manually retried via `POST /jobs/:id/retry`

---

### 2. NFT Mint Queue

**Name:** `nft-mint`
**Purpose:** Prepare Soroban NFT mint transactions
**Workers:** Typically 1-2 (Soroban RPC bottleneck)

**Job Payload:**
```ts
{
  clipId: number;
  walletAddress: string;
  userId: number;
}
```

**Configuration:**
- Retry attempts: 3
- Backoff: Exponential, 2000ms initial delay
- Processor: `NftMintProcessor` (`src/clips/nft-mint.processor.ts`)
- Circuit breaker: Soroban RPC with 30s recovery timeout

**Flow Diagram:**
```
POST /clips/:id/mint
    │
    ▼
NftMintService.enqueueMint()
    │
    ├─ Circuit breaker open? ──► HTTP 503
    │
    └─ OK
        ▼
    BullMQ Queue (waiting)
        ▼
    NftMintProcessor
        ├─ NftMintService.prepareMintTx()
        ├─ Call Soroban RPC
        └─ Return transaction XDR
        ▼
    Frontend signs & calls POST /clips/:id/mint/confirm
        ▼
    Stellar transaction submitted
```

**Why isolated from clip-generation?**
Soroban RPC has different latency and failure characteristics than FFmpeg. Isolation prevents Soroban outages from blocking video processing and allows independent scaling.

---

### 3. Email Delivery Queue

**Name:** `email-delivery`
**Purpose:** Send transactional emails asynchronously
**Workers:** 1-2 instances

**Job Types:**
- Magic links (login)
- Password reset tokens
- Payout receipts
- Verification emails

**Configuration:**
- Processor: `EmailDeliveryProcessor` (`src/auth/email-delivery.processor.ts`)

**Flow:**
```
User action (login/reset/payout)
    ▼
AuthService.sendMagicLink() / etc.
    ▼
EmailDeliveryQueue.add(job)
    ▼
EmailDeliveryProcessor
    ├─ Render template
    ├─ Call email provider (SendGrid/Resend)
    └─ Log delivery
```

---

### 4. Payout Retry Queue

**Name:** `payout-retry`
**Purpose:** Retry failed Stellar payout transactions
**Workers:** 1-2 instances

**Job Payload:**
```ts
{
  payoutId: number;
  destinationAccount: string;
  amount: number;
}
```

**Configuration:**
- Processor: `PayoutRetryProcessor` (`src/payouts/payout-retry.processor.ts`)

**Flow:**
```
Scheduled payout OR failed payout retry
    ▼
PayoutService.enqueuePayout()
    ▼
BullMQ Queue
    ▼
PayoutRetryProcessor
    ├─ Build Stellar transaction
    ├─ Submit via Horizon
    └─ Update DB (success/failure)
        ▼
    If failed: job moves to failed set, can be retried manually
```

---

### 5. Anomaly Detection Queue

**Name:** `anomaly-detection`
**Purpose:** Detect fraud/unusual earning patterns
**Workers:** 1 instance (CPU-intensive)

**Job Payload:**
```ts
{
  userId: number;
  earningId: number;
  amount: number;
}
```

**Configuration:**
- Processor: `AnomalyDetectionProcessor` (`src/earnings/anomaly-detection.processor.ts`)

---

## Rate Limiting

Enqueue rate limiting (not worker throughput limiting) is implemented per-user per-queue.

**Implementation:**
- Guard: `QueueRateLimitGuard` (`src/common/guards/queue-rate-limit.guard.ts`)
- Mechanism: Redis `INCR` + `EXPIRE` on key `queue:ratelimit:{queue}:user:{userId}`
- TTL: 1 hour sliding window
- Response: HTTP 429 when exceeded

**Current Limits:**
| Queue | Limit |
|-------|-------|
| `clip-generation` | 5 jobs/hour per user |

**How to apply:**
```ts
@Post('my-endpoint')
@UseGuards(QueueRateLimitGuard)
@QueueRateLimit({ queue: 'clip-generation', maxJobs: 5 })
async myHandler() { ... }
```

---

## Scaling Strategies

### Horizontal Scaling

Workers are **stateless** — run multiple API instances and each will compete for jobs:

```bash
# Instance 1
npm run start:dev

# Instance 2
npm run start:dev

# Instance 3
npm run start:dev

# All compete for jobs from the same Redis queue
```

No extra coordination needed. BullMQ handles fair job distribution.

### Dedicated Worker Processes

For production, separate API from workers:

```bash
# Main API (no workers)
DISABLE_WORKERS=true node dist/main.js

# Dedicated clip generation worker
PROCESSORS=clip-generation node dist/workers/clip-generation.worker.js

# Dedicated NFT mint worker
PROCESSORS=nft-mint node dist/workers/nft-mint.worker.js

# Dedicated email worker
PROCESSORS=email-delivery node dist/workers/email-delivery.worker.js
```

Benefits:
- API stays responsive during heavy FFmpeg processing
- Soroban RPC timeouts don't block API
- Independent scaling by queue demand
- Easier to monitor and debug

### Per-Processor Concurrency

Control how many jobs run in parallel within a worker:

```ts
@Processor(CLIP_GENERATION_QUEUE, { concurrency: 4 })
export class ClipGenerationProcessor {
  // Processes 4 jobs in parallel
}
```

**Tuning:**
- `clip-generation`: 1-4 (FFmpeg is CPU-bound, depends on instance size)
- `nft-mint`: 1-2 (Soroban RPC is the bottleneck)
- `email-delivery`: 4-10 (I/O-bound, lightweight)
- `payout-retry`: 1-2 (Stellar network serialization)

---

## Monitoring & Metrics

### Queue Depth

Tracked as Prometheus gauge:
```
clipcash_job_queue_depth{queue="clip-generation"}
clipcash_job_queue_depth{queue="nft-mint"}
clipcash_job_queue_depth{queue="email-delivery"}
```

Scraped at `/metrics` (requires `x-metrics-token` header).

### Queue Status Endpoint

```
GET /jobs/status?type=clip-generation
```

Returns:
```json
{
  "queue": "clip-generation",
  "waiting": 12,
  "active": 3,
  "completed": 456,
  "failed": 2,
  "delayed": 0
}
```

### Failed Jobs Inspection

```
GET /jobs/failed?type=clip-generation&limit=10
```

Returns list with `failedReason` and `stacktrace`.

---

## Troubleshooting

### Jobs stuck in `waiting`

**Cause:** No workers running or Redis unreachable

**Fix:**
1. Ensure Redis is reachable: `redis-cli ping`
2. Verify `REDIS_HOST` / `REDIS_PORT` in `.env`
3. Check worker logs: `grep -i "error\|connection" logs/app.log`
4. Restart workers

### High queue depth

**Cause:** Workers can't keep up with job enqueue rate

**Fix:**
1. Increase worker concurrency (if CPU/memory allows)
2. Spin up additional worker instances
3. Check processor logs for slowdowns:
   - FFmpeg timeouts?
   - Cloudinary upload failures?
   - Database connection pool exhausted?

### Jobs failing repeatedly

**Cause:** Processor bug or external service down

**Fix:**
1. Inspect failed job: `GET /jobs/failed?type=clip-generation`
2. Check `failedReason` and `stacktrace`
3. Fix processor code or external service
4. Retry: `POST /jobs/:id/retry`

### 429 on job creation

**Cause:** User hit rate limit

**Fix:**
1. Rate limit resets after 1 hour
2. Check current counter: `redis-cli GET "queue:ratelimit:clip-generation:user:{userId}"`
3. Manual reset (admin only): `redis-cli DEL "queue:ratelimit:clip-generation:user:{userId}"`

### Soroban RPC errors (NFT mint)

**Cause:** Circuit breaker open (Soroban RPC down)

**Fix:**
1. Check circuit status: `GET /circuit-breaker/status`
2. Wait for recovery timeout (default 30s)
3. Or reset manually: `POST /circuit-breaker/reset?name=soroban-nft-mint`

---

## Configuration

**Environment Variables:**

| Variable | Default | Description |
|----------|---------|-------------|
| `REDIS_HOST` | `localhost` | Redis hostname |
| `REDIS_PORT` | `6379` | Redis port |
| `REDIS_PASSWORD` | _(none)_ | Redis password |
| `DISABLE_WORKERS` | `false` | Disable all workers in this instance |
| `PROCESSORS` | _(all)_ | Comma-separated list of processors to run |
| `QUEUE_CONCURRENCY_CLIP_GEN` | `1` | Clip generation concurrency |
| `QUEUE_CONCURRENCY_NFT_MINT` | `1` | NFT mint concurrency |
| `QUEUE_CONCURRENCY_EMAIL` | `5` | Email delivery concurrency |

---

## Best Practices

1. **Always use typed job payloads** — define `interface JobType { ... }`
2. **Implement idempotent processors** — jobs can be retried, so handle duplicate execution
3. **Log job progress** — helps debugging when jobs fail
4. **Use sensible retry settings** — 3 attempts is typical; adjust backoff for external service call latency
5. **Monitor queue depth** — use Prometheus alerts to catch buildup early
6. **Separate read-heavy from write-heavy** — clip generation is write-intensive; consider isolated workers
7. **Test failure scenarios** — kill Redis/Stellar/Cloudinary and verify retry behavior
