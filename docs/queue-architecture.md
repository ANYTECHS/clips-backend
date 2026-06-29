# Queue Architecture

ClipCash uses [BullMQ](https://docs.bullmq.io/) backed by Redis for all asynchronous job processing. This document covers every queue, its configuration, rate limiting, scaling, and troubleshooting.

---

## Overview

```
HTTP Request
     │
     ▼
 Controller  ──(rate limit check via Redis)──► 429 Too Many Requests
     │
     ▼
  Service  ──► BullMQ Queue (Redis) ──► Processor (Worker)
                                              │
                                         Job result / event
```

All queues share a single Redis connection configured via `REDIS_HOST` / `REDIS_PORT` in `.env`.

---

## Queues

### 1. `clip-generation`

| Property | Value |
|---|---|
| Constant | `CLIP_GENERATION_QUEUE` in `src/clips/clip-generation.queue.ts` |
| Processor | `ClipGenerationProcessor` (`src/clips/clip-generation.processor.ts`) |
| Retry | 3 attempts, exponential backoff starting at 1 000 ms |
| Rate limit | Max **5 concurrent jobs per user** (Redis-tracked) |

**Job payload (`ClipGenerationJob`):**

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

**Flow:**
1. `POST /clips/generate` → `QueueRateLimitGuard` checks Redis counter
2. `ClipsService.enqueueClip()` adds job to BullMQ
3. `ClipGenerationProcessor` runs FFmpeg, uploads to Cloudinary, updates DB
4. WebSocket event emitted to client on completion/failure

---

### 2. `nft-mint`

| Property | Value |
|---|---|
| Constant | `NFT_MINT_QUEUE` in `src/clips/nft-mint.queue.ts` |
| Processor | `NftMintProcessor` (`src/clips/nft-mint.processor.ts`) |
| Retry | 3 attempts, exponential backoff starting at 2 000 ms |

**Job payload (`NftMintJob`):**

```ts
{
  clipId: number;
  walletAddress: string;
  userId: number;
}
```

**Flow:**
1. Mint request received → job added to `nft-mint` queue
2. `NftMintProcessor` calls `NftMintService.prepareMintTx()`
3. Soroban transaction XDR returned to caller for signing
4. Frontend signs and submits; calls `POST /clips/:id/mint/confirm`

**Why separate from `clip-generation`?**
NFT minting calls the Stellar Soroban RPC which has different latency and failure modes than FFmpeg processing. Isolation prevents Soroban outages from blocking video processing and allows independent scaling.

---

### 3. `email-delivery`

| Property | Value |
|---|---|
| Constant | defined in `src/auth/email-delivery.queue.ts` |
| Processor | `EmailDeliveryProcessor` (`src/auth/email-delivery.processor.ts`) |

Used for transactional emails (magic links, password reset, payout receipts).

---

## Rate Limiting

Queue job creation is rate-limited per user using Redis counters (not BullMQ's built-in rate limiter, which limits worker throughput rather than enqueue rate).

### Implementation

`QueueRateLimitGuard` (`src/common/guards/queue-rate-limit.guard.ts`):

- Uses `INCR` + `EXPIRE` on key `queue:ratelimit:{queue}:user:{userId}`
- TTL window: **1 hour**
- Returns **HTTP 429** when limit exceeded, decrements counter so it stays accurate

### Limits

| Queue | Max concurrent jobs per user |
|---|---|
| `clip-generation` | 5 |

### Applying to a new endpoint

```ts
@Post('my-endpoint')
@UseGuards(QueueRateLimitGuard)
@QueueRateLimit({ queue: 'clip-generation', maxJobs: 5 })
async myHandler() { ... }
```

---

## Job Options

### `clip-generation`

```ts
export const CLIP_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 1000 },
};
```

### `nft-mint`

```ts
export const NFT_MINT_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 2000 },
};
```

Failed jobs after all retries are moved to BullMQ's **failed set** and can be retried via `POST /jobs/:id/retry`.

---

## Metrics

Queue depth is tracked as a Prometheus gauge:

```
clipcash_job_queue_depth{queue="clip-generation"}
```

Scraped at `/metrics` (requires `x-metrics-token` header).

---

## Scaling

### Horizontal scaling

BullMQ workers are stateless — run multiple instances of the backend and each will compete for jobs from the same Redis queue. No extra config needed.

### Separate worker processes

For production, run processors in dedicated worker processes:

```bash
# Main API (no workers)
DISABLE_WORKERS=true node dist/main.js

# Dedicated clip worker
node dist/workers/clip-generation.worker.js

# Dedicated NFT mint worker
node dist/workers/nft-mint.worker.js
```

### Concurrency

Set per-processor concurrency in the `@Processor` decorator:

```ts
@Processor(CLIP_GENERATION_QUEUE, { concurrency: 4 })
```

Default is 1 (serial processing per worker instance).

---

## Troubleshooting

### Jobs stuck in `waiting`

- Check Redis is reachable: `redis-cli ping`
- Verify `REDIS_HOST` / `REDIS_PORT` in `.env`
- Check worker logs for startup errors

### Jobs failing repeatedly

1. Check failed jobs: `GET /jobs/failed?type=clip-generation`
2. Inspect `failedReason` and `stacktrace` in the response
3. Retry a specific job: `POST /jobs/:id/retry`

### 429 on job creation

The user has hit the per-queue rate limit. The counter resets after 1 hour. Check Redis:

```bash
redis-cli GET "queue:ratelimit:clip-generation:user:{userId}"
```

To manually reset:

```bash
redis-cli DEL "queue:ratelimit:clip-generation:user:{userId}"
```

### Soroban RPC errors during NFT mint

The `nft-mint` queue uses a circuit breaker (`soroban-nft-mint`). If the circuit is open:

- Check `GET /circuit-breaker/status`
- Wait for `recoveryTimeout` (30 s) or reset manually

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `REDIS_HOST` | `localhost` | Redis hostname |
| `REDIS_PORT` | `6379` | Redis port |
| `REDIS_PASSWORD` | _(none)_ | Redis password (optional) |
