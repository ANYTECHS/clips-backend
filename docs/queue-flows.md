# BullMQ Job Flows

This document maps the complete BullMQ lifecycle for clip generation, posting, and minting jobs. It covers queue creation, processing workers, retries, failure handling, and downstream dependencies.

---

## Overview

The system uses four main job queues backed by Redis:

```
┌─────────────────────────────────────────────────────────────┐
│                    API Request / Event                       │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
        ┌──────────────────────────────────────────┐
        │    Rate Limit Check (Redis counter)      │
        └──────────────────┬───────────────────────┘
                           │
                           ▼
        ┌──────────────────────────────────────────┐
        │      Enqueue Job to BullMQ (Redis)       │
        └──────────────────┬───────────────────────┘
                           │
                           ▼
        ┌──────────────────────────────────────────┐
        │   Worker Process (Processor)             │
        │  ┌─────────────────────────────────────┐ │
        │  │  Execute Job Logic                  │ │
        │  │  - Download input                   │ │
        │  │  - Process                          │ │
        │  │  - Upload output                    │ │
        │  │  - Update database                  │ │
        │  └─────────────────────────────────────┘ │
        │  ┌─────────────────────────────────────┐ │
        │  │  On Success: Complete               │ │
        │  │  On Failure: Retry or Move to Failed│ │
        │  └─────────────────────────────────────┘ │
        └──────────────────┬───────────────────────┘
                           │
               ┌───────────┴────────────┐
               │                        │
               ▼                        ▼
        ┌─────────────────┐     ┌──────────────────┐
        │ Job Complete    │     │ Job Failed       │
        │ (Completed set) │     │ (Failed set)     │
        └─────────────────┘     └──────────────────┘
                │                        │
                │ Emit event             │ Notify via
                │ WebSocket              │ job-failure-notifier
                │                        │
                ▼                        ▼
           Client update            Admin alert
```

---

## Queue 1: clip-generation

**Purpose:** Transform raw video into clip assets via FFmpeg

**Definition:** `src/clips/clip-generation.queue.ts`
**Processor:** `src/clips/clip-generation.processor.ts`

### Job Payload

```typescript
interface ClipGenerationJob {
  videoId: string;           // Reference to Video entity
  inputPath: string;         // s3://bucket/path/video.mp4
  outputPath: string;        // s3://bucket/path/clip.mp4
  startTime: number;         // Milliseconds
  endTime: number;           // Milliseconds
  positionRatio: number;     // 0.5 = center position (unused for now)
  transcript?: string;       // Optional transcript
  title?: string;            // Optional clip title
  clipId?: number;           // Reference to Clip entity
}
```

### Lifecycle

1. **Enqueue** (`ClipsService.enqueueClip()`)
   - User calls `POST /clips/generate`
   - `QueueRateLimitGuard` checks Redis counter for user (max 5 concurrent)
   - Returns 429 if limit exceeded
   - Job added to `clip-generation` queue with priority 5

2. **Process** (`ClipGenerationProcessor.process()`)
   - Worker picks job from queue
   - Validates payload
   - Downloads input video from S3
   - Executes FFmpeg to extract clip (startTime to endTime)
   - Uploads output to Cloudinary
   - Stores URL and metadata in database (Clip record)
   - Emits WebSocket event: `clip:generated` or `clip:generation-failed`

3. **Retry on Failure**
   - **Attempts:** 5 (1 initial + 4 auto-retries)
   - **Backoff:** Exponential (2s, 4s, 8s, 16s)
   - **Trigger reasons:**
     - S3 network timeout (transient)
     - FFmpeg OOM (process restarted)
     - Cloudinary rate limit (transient)
     - Database connection drop (transient)

4. **Final Failure** (after 5 attempts)
   - Job moved to failed set
   - `@OnWorkerEvent('failed')` handler invokes `JobFailureNotifierService`
   - Sends alert to admin emails (configured via `ADMIN_EMAILS` env var)
   - Clip record marked with `status: 'generation-failed'`

5. **Manual Retry**
   - Operator calls `POST /jobs/:id/retry`
   - Job moved back to waiting set
   - Worker picks it up again on next available slot

### Configuration

- **Queue name:** `clip-generation`
- **Max concurrent per user:** 5 (enforced via Redis counter)
- **Worker concurrency:** Configured in `@Processor` decorator (default 1)
- **Timeout:** BullMQ default (30s)
- **Rate limit window:** 1 hour (sliding)

### Failure Modes

| Failure | Root cause | User sees | Recovery |
|---------|-----------|-----------|----------|
| Network timeout | S3 unavailable | Retry auto (up to 4x) | Operator: manual retry |
| Invalid input path | Frontend bug | All 5 retries fail | Developer fix required |
| Cloudinary quota | Billing issue | Retry auto | Operator: add quota or manual retry |
| FFmpeg crash | Memory pressure | Retry auto | Operator: manual retry or scale up |

---

## Queue 2: clip-posting

**Purpose:** Post generated clips to external platforms (TikTok, YouTube, Instagram, Twitch)

**Definition:** `src/clips/clip-posting.queue.ts`
**Processor:** `src/clips/clip-posting.processor.ts`

### Job Payload

```typescript
interface ClipPostingJob {
  clipId: number;            // Reference to Clip entity
  userId: number;            // Reference to User entity
  platforms: string[];       // ['tiktok', 'youtube', 'instagram']
  accessTokens: Record<string, string>; // { tiktok: 'token...', youtube: 'token...' }
}
```

### Lifecycle

1. **Enqueue** (`ClipsService.enqueuePosting()`)
   - User calls `POST /clips/:id/post`
   - Validates clip is ready and user owns it
   - Retrieves user's access tokens for selected platforms from database
   - Job enqueued with platforms list

2. **Process** (`ClipPostingProcessor.process()`)
   - Worker picks job
   - For each platform:
     - Call platform's upload API (TikTok, YouTube, etc.)
     - Store `postId` in database (ClipPlatformStatus record)
     - Mark platform as `posted`
   - Webhook endpoint subscribes to platform events (TikTok, YouTube notify on completion)
   - Emits `clip:posted` event per platform

3. **Retry on Failure**
   - **Attempts:** 3
   - **Backoff:** Exponential (2s, 4s)
   - **Trigger reasons:**
     - Platform API timeout
     - Invalid access token (refresh and retry)
     - Platform rate limit
     - Network transient

4. **Final Failure** (after 3 attempts)
   - Job moved to failed set
   - Admin notified
   - User shown error in UI (can retry manually)

5. **Webhook Handling**
   - Platform sends webhook to `POST /webhooks/tiktok` or `POST /webhooks/youtube`
   - Updates clip analytics (views, engagement, earnings)
   - Triggers earnings reconciliation job if data changed

### Configuration

- **Queue name:** `clip-posting`
- **Max concurrent per user:** Unlimited (no guard)
- **Worker concurrency:** 2 (platform APIs have rate limits)
- **Timeout:** 60s per platform

### Failure Modes

| Failure | Root cause | User sees | Recovery |
|---------|-----------|-----------|----------|
| Invalid token | Token expired | Job fails, prompt refresh | User: refresh token via UI |
| Platform rate limit | Too many posts in period | Retry auto | Operator: wait or reduce load |
| Platform API down | Maintenance or outage | Retry auto | Operator: manual retry when back |
| Bad clip URL | Clip generation failed | All 3 retries fail | User: regenerate clip |

---

## Queue 3: nft-mint

**Purpose:** Prepare Soroban contract transaction for NFT minting

**Definition:** `src/clips/nft-mint.queue.ts`
**Processor:** `src/clips/nft-mint.processor.ts`

### Job Payload

```typescript
interface NftMintJob {
  clipId: number;            // Reference to Clip entity
  walletAddress: string;     // User's Stellar wallet
  userId: number;            // Reference to User entity
}
```

### Lifecycle

1. **Enqueue** (`NftMintService.enqueueMint()`)
   - User calls `POST /clips/:id/mint` with wallet address
   - Validates clip exists and is posted
   - Job enqueued to `nft-mint` queue

2. **Process** (`NftMintProcessor.process()`)
   - Worker picks job
   - Calls `NftMintService.prepareMintTx()`
   - Builds Soroban contract transaction XDR:
     - Contract: `SOROBAN_NFT_CONTRACT_ID` (env var)
     - Recipient: `walletAddress`
     - Royalty BPS: `CREATOR_ROYALTY_BPS` (default 1000 = 10%) and `PLATFORM_ROYALTY_BPS` (default 100 = 1%)
     - Metadata: clip title, URL, IPFS hash
   - Returns XDR to caller
   - Frontend receives XDR in response

3. **Off-Chain: User Signs**
   - Frontend uses Stellar SDK to sign XDR with user's secret key
   - Signed XDR sent to `POST /clips/:id/mint/confirm`

4. **Confirm** (`NftMintService.submitMintTx()`)
   - Backend submits signed XDR to Stellar network
   - Polls for transaction confirmation (up to 10 retries, 2s backoff)
   - On success: Updates Clip record with `mintTx`, `nftId`, `status: 'minted'`
   - On failure: Throws error, user can retry from step 2

5. **Retry on Failure**
   - **Attempts:** 3
   - **Backoff:** Exponential (2s, 4s)
   - **Trigger reasons:**
     - Soroban RPC timeout
     - Network transient error
     - Contract validation failure

6. **Final Failure** (after 3 attempts)
   - Job moved to failed set
   - Admin notified
   - User can call `POST /clips/:id/mint` again to retry from step 1

### Circuit Breaker

- `soroban-nft-mint` circuit breaker wraps Soroban RPC calls
- If Soroban RPC is down, circuit opens after 5 consecutive failures
- All subsequent requests fail fast (no retry) for 30s (`recoveryTimeout`)
- User sees: "Soroban service temporarily unavailable"
- Operator checks: `GET /circuit-breaker/status`
- Manual reset: `POST /circuit-breaker/:id/reset`

### Configuration

- **Queue name:** `nft-mint`
- **Max concurrent per user:** Unlimited
- **Worker concurrency:** 1 (Soroban RPC is single-threaded per user)
- **Timeout:** 30s per job

### Failure Modes

| Failure | Root cause | User sees | Recovery |
|---------|-----------|-----------|----------|
| Soroban RPC down | Network or maintenance | Circuit open, "unavailable" | Wait for recovery (30s) or operator reset |
| Invalid wallet | Typo in address | Job fails | User: correct wallet and retry |
| Insufficient balance | User wallet low XLM | Tx rejection on submit | User: fund wallet and retry |
| Contract call invalid | Bad clip metadata | Tx validation error | Developer: check contract logic |

---

## Queue 4: email-delivery

**Purpose:** Send transactional emails (magic links, password resets, payout receipts)

**Definition:** `src/auth/email-delivery.queue.ts`
**Processor:** `src/auth/email-delivery.processor.ts`

### Job Payload

```typescript
interface EmailDeliveryJob {
  userId: number;            // Reference to User entity
  template: 'verification' | 'password-reset' | 'magic-link';
  recipient: string;         // Email address
  data: Record<string, any>; // Template variables (token, link, etc.)
}
```

### Lifecycle

1. **Enqueue** (`MailService.sendEmail()`)
   - Service needs to send email (e.g., auth, payouts)
   - Creates job with template and recipient
   - Job enqueued to `email-delivery` queue

2. **Process** (`EmailDeliveryProcessor.process()`)
   - Worker picks job
   - Renders template with data (Handlebars or similar)
   - Calls email provider (SendGrid, Mailgun, etc.)
   - Logs send result

3. **Retry on Failure**
   - **Attempts:** 3
   - **Backoff:** Exponential
   - **Trigger reasons:**
     - Email provider timeout
     - Network transient
     - Invalid recipient (no retry on permanent)

4. **Final Failure** (after 3 attempts)
   - Job moved to failed set
   - Email not sent (user doesn't get magic link, etc.)
   - Operator manual retry via `POST /jobs/:id/retry`

### Configuration

- **Queue name:** `email-delivery`
- **Max concurrent per user:** Unlimited
- **Worker concurrency:** 5 (email provider can handle many concurrent)
- **Timeout:** 10s per job

---

## Monitoring and Debugging

### Queue Depth Metric

BullMQ queue depth is exported as Prometheus gauge:

```
clipcash_job_queue_depth{queue="clip-generation"} 42
clipcash_job_queue_depth{queue="clip-posting"} 5
clipcash_job_queue_depth{queue="nft-mint"} 1
clipcash_job_queue_depth{queue="email-delivery"} 0
```

Scraped at `GET /metrics` (requires `x-metrics-token` header).

### List Failed Jobs

```bash
curl http://localhost:3000/jobs/failed?type=clip-generation \
  -H "x-metrics-token: $METRICS_TOKEN"
```

Response:

```json
{
  "failed": [
    {
      "id": "abc123",
      "type": "clip-generation",
      "failedReason": "ENOENT: no such file or directory, open '/tmp/input.mp4'",
      "stacktrace": "...",
      "failureCount": 5,
      "createdAt": "2024-01-15T10:30:00Z"
    }
  ]
}
```

### Retry a Failed Job

```bash
curl -X POST http://localhost:3000/jobs/abc123/retry \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

### View Active Jobs

```bash
curl http://localhost:3000/jobs/active?type=clip-generation \
  -H "x-metrics-token: $METRICS_TOKEN"
```

---

## Environment Variables

| Variable | Default | Queue | Purpose |
|----------|---------|-------|---------|
| `REDIS_HOST` | `localhost` | All | Redis hostname |
| `REDIS_PORT` | `6379` | All | Redis port |
| `REDIS_PASSWORD` | _(none)_ | All | Redis password |
| `EARNINGS_CACHE_TTL` | `3600` | - | Earnings cache expiry (seconds) |
| `LEADERBOARD_ENABLED` | `false` | - | Enable leaderboard feature |
| `SOROBAN_NFT_CONTRACT_ID` | _(required)_ | nft-mint | Soroban contract address |
| `CREATOR_ROYALTY_BPS` | `1000` | nft-mint | Creator royalty (basis points) |
| `PLATFORM_ROYALTY_BPS` | `100` | nft-mint | Platform royalty (basis points) |
| `ADMIN_EMAILS` | _(none)_ | All | Comma-separated admin emails for alerts |
| `TIKTOK_WEBHOOK_SECRET` | _(required)_ | clip-posting | TikTok webhook secret |
| `YOUTUBE_WEBHOOK_SECRET` | _(required)_ | clip-posting | YouTube webhook secret |

---

## Scaling Considerations

### Horizontal Scaling

All workers are stateless. To add capacity:

```bash
# Main API + embedded workers
node dist/main.js

# Additional dedicated worker instance (same machine or different)
node dist/main.js
```

Each instance competes for jobs from the same Redis queue. No additional configuration needed.

### Separate Worker Process

For production, isolate workers from API:

```bash
# Main API (no workers)
DISABLE_WORKERS=true node dist/main.js

# Dedicated clip-generation worker
WORKER_QUEUE=clip-generation node dist/workers/clip-generation.worker.js

# Dedicated nft-mint worker
WORKER_QUEUE=nft-mint node dist/workers/nft-mint.worker.js
```

### Concurrency Tuning

Adjust per-processor concurrency based on resource limits:

```typescript
@Processor(CLIP_GENERATION_QUEUE, { concurrency: 4 })
export class ClipGenerationProcessor {
  // ...
}
```

- `clip-generation`: 2-4 (CPU-bound, memory-intensive)
- `nft-mint`: 1-2 (I/O-bound, Soroban RPC rate limit)
- `email-delivery`: 5-10 (I/O-bound, fast)
- `clip-posting`: 2-3 (I/O-bound, platform rate limits)
