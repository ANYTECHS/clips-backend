# Async Job Queue Flows

ClipCash uses **BullMQ** backed by **Redis** to handle all computationally heavy and
network-bound operations asynchronously.  Every queue follows the same lifecycle:

```
API Request  →  Enqueue Job  →  Redis (BullMQ)  →  Worker Processor  →  DB / External Service
```

---

## Table of Contents

1. [Queue Overview](#queue-overview)
2. [Clip Generation Flow](#1-clip-generation-flow)
3. [Social Posting Flow](#2-social-posting-flow)
4. [NFT Minting Flow](#3-nft-minting-flow)
5. [Payout Retry Flow](#4-payout-retry-flow)
6. [Email Delivery Flow](#5-email-delivery-flow)
7. [Anomaly Detection Flow](#6-anomaly-detection-flow)
8. [Job Retries and Backoff](#job-retries-and-backoff)
9. [Failed Jobs and Dead-Letter Handling](#failed-jobs-and-dead-letter-handling)
10. [API Endpoints that Create Jobs](#api-endpoints-that-create-jobs)
11. [Job Status Endpoints](#job-status-endpoints)
12. [Asynchronous Response Pattern](#asynchronous-response-pattern)

---

## Queue Overview

| Queue name         | Processor class             | Concurrency (default) | Retry attempts |
|--------------------|-----------------------------|-----------------------|----------------|
| `clip-generation`  | `ClipGenerationProcessor`   | 2                     | 3              |
| `clip-posting`     | `ClipPostingProcessor`      | 10                    | 3              |
| `nft-mint`         | `NftMintProcessor`          | 2                     | 3              |
| `payout-retry`     | `PayoutRetryProcessor`      | 2                     | 5              |
| `email-delivery`   | `EmailDeliveryProcessor`    | 5                     | 3              |
| `anomaly-detection`| `AnomalyDetectionProcessor` | 1                     | 3              |

Concurrency values are tunable at runtime via environment variables (see
[BULLMQ_WORKER_SCALING.md](../BULLMQ_WORKER_SCALING.md)).

---

## 1. Clip Generation Flow

### Purpose
Runs FFmpeg to cut a video segment from a source file, optionally analyses
the segment with Claude AI for a virality score, then uploads the result to
Cloudinary.

### Trigger
`POST /clips` or `POST /videos/:id/generate-clips` → `ClipsService.enqueueClip()`

### Flow Diagram

```
 Client
   │
   ├─ POST /videos/:id/generate-clips
   │       (returns { jobId, status: "queued" })
   │
   ▼
 ClipsService
   ├─ Creates Clip row in DB (status = "queued")
   └─ Enqueues job on  clip-generation  queue
          │
          ▼ (async — worker picks up when capacity is free)
 ClipGenerationProcessor.process(job)
   ├─ 10% progress  — verify source video exists / download if remote
   ├─ 30% progress  — call Claude AI for transcript / virality score (optional)
   ├─ 60% progress  — FFmpeg: cut segment (startTime → endTime)
   ├─ 80% progress  — upload MP4 to Cloudinary, generate thumbnail
   └─ 100% progress — update Clip row: status="ready", clipUrl, thumbnailUrl
          │
          ▼
 WebSocket (ClipsGateway)
   └─ Emits  clip:progress  and  clip:ready  events to subscribing clients
```

### Job Data Shape
```typescript
interface ClipGenerationJob {
  videoId: string;
  inputPath: string;      // absolute path to source video
  outputPath: string;     // desired output clip path
  startTime: number;      // seconds (float)
  endTime: number;        // seconds (float)
  positionRatio: number;  // 0.0–1.0
  videoDuration?: number;
  transcript?: string;
  title?: string;
  clipId?: number;        // existing DB row to update
}
```

### Error Handling
- If FFmpeg exits non-zero → job is retried (exponential backoff, max 3 attempts).
- If Cloudinary upload fails → `UPLOAD_MAX_ATTEMPTS = 3` internal retries before
  the BullMQ job itself fails.
- If all retries are exhausted → Clip row is set to `status = "failed"` and a
  `CLIP_GENERATION_FAILED_EVENT` is emitted via EventEmitter2.

---

## 2. Social Posting Flow

### Purpose
Posts a ready clip to one or more social media platforms using the Ayrshare
integration.  Kept in a separate queue from clip-generation so I/O-bound posting
jobs do not contend with CPU-heavy FFmpeg work.

### Trigger
`POST /clips/:id/post` → `ClipPublishService.publishClip()` → enqueues job on
`clip-posting` queue.

### Flow Diagram

```
 Client
   │
   ├─ POST /clips/:id/post  { platforms: ["tiktok","instagram"] }
   │       (returns { jobId, status: "queued" })
   │
   ▼
 ClipPublishService
   ├─ Validates clip is in "ready" state
   ├─ Validates user has connected platforms
   └─ Enqueues job on  clip-posting  queue
          │
          ▼ (async)
 ClipPostingProcessor.process(job)
   ├─ 10% — resolve which requested platforms the user still has connected
   ├─ 30% — call AyrshareService.post() for each valid platform
   │         (rate-limited per platform)
   ├─ 70% — persist ClipPost rows: { platform, externalPostId, status }
   └─ 100%— update Clip.postStatus = "posted"
          │
          ▼
 WebSocket (ClipsGateway)
   └─ Emits  clip:posted  event with platform results
```

### Job Data Shape
```typescript
interface ClipPostingJob {
  clipId: number;
  userId: number;
  mediaUrl: string;     // Cloudinary URL
  caption: string;
  platforms: string[];  // e.g. ["tiktok", "instagram_reels"]
}
```

### Error Handling
- Platform API rate limits → BullMQ exponential backoff (2 s, 4 s, 8 s).
- Platforms that reject the post (invalid token, etc.) → that platform's
  `ClipPost` row is marked `status = "failed"` while other platforms succeed.
- Full job failure after 3 attempts → `ClipPost.status = "failed"` for all
  remaining platforms, `Clip.postStatus = "failed"`.

---

## 3. NFT Minting Flow

### Purpose
Prepares and submits a Soroban smart-contract transaction to mint a clip as an
NFT on the Stellar network, uploads metadata to IPFS (Pinata) first.

### Trigger
`POST /clips/:id/mint` → `NftMintService.enqueueMintJob()` → enqueues job on
`nft-mint` queue.

### Flow Diagram

```
 Client
   │
   ├─ POST /clips/:id/mint  { walletAddress, royaltyBps }
   │       (returns { jobId, status: "pending" })
   │
   ▼
 NftMintService.enqueueMintJob()
   ├─ Validates clip exists and is in "ready" state
   ├─ Validates clip has not already been minted (mintTxHash must be null)
   ├─ Checks clip is not in "posted" state (auto-posted clips cannot be minted)
   └─ Enqueues job on  nft-mint  queue
          │
          ▼ (async)
 NftMintProcessor.process(job)
   ├─ Upload clip metadata JSON → Pinata IPFS (returns metadataUri)
   ├─ Call Soroban RPC to build XDR transaction for nft_mint contract function
   └─ Return { xdr, clipId }
          │
          ▼
 API Response (polling / webhook)
   └─ Client signs XDR with Freighter / Albedo wallet and submits to Stellar
          │
          ▼
 POST /clips/:id/mint/confirm  (after user signs)
   └─ Persist mintTxHash, update Clip.mintStatus = "minted"
```

### Job Data Shape
```typescript
interface NftMintJob {
  clipId: number;
  walletAddress: string;  // Stellar G... address
  userId: number;
}
```

### Error Handling
- Soroban RPC errors → retried 3 times (exponential backoff starting at 2 s).
- IPFS upload failures → retried independently inside `IpfsUploadService`
  before the BullMQ job fails.
- `UnrecoverableError` thrown for: clip not found, already minted, invalid
  wallet address — these are **not** retried.

---

## 4. Payout Retry Flow

### Purpose
Retries a Stellar XLM payout that previously failed (e.g. due to a transient
Stellar node error or insufficient sequence number).

### Trigger
- Automatic: `PayoutStateMachineService` enqueues a retry when a payout
  transitions to `status = "failed"`.
- Manual: `POST /admin/payouts/:id/retry` (admin only).

### Flow Diagram

```
 PayoutStateMachineService  (or Admin API)
   └─ Enqueues job on  payout-retry  queue
          │
          ▼ (async)
 PayoutRetryProcessor.process(job)
   └─ Calls PayoutsService.processPayout(payoutId)
             ├─ Fetch payout from DB
             ├─ Re-validate amounts and limits
             ├─ Submit Stellar XLM transfer via StellarService
             └─ Update payout status: "completed" | "failed"
```

### Job Data Shape
```typescript
interface PayoutRetryJob {
  payoutId: number;
}
```

### Error Handling
- Transient Stellar errors → up to 5 retry attempts with exponential backoff.
- Permanent errors (insufficient balance, account not found) → job moves to
  `failed` state; payout record updated with `failureReason`.
- Final failure triggers `JobFailureNotifierService` which sends an alert
  notification (Slack / email).

---

## 5. Email Delivery Flow

### Purpose
Sends transactional emails (verification, password reset, welcome, payout
receipts) asynchronously so that HTTP handlers return immediately.

### Trigger
Various service methods call `EmailDeliveryService.queueEmail()` which enqueues
a job on the `email-delivery` queue.

### Flow Diagram

```
 AuthService / PayoutReceiptService / etc.
   └─ EmailDeliveryService.queueEmail({ to, template, data })
          │
          ▼ enqueues on  email-delivery  queue
 EmailDeliveryProcessor.process(job)
   └─ MailService.send(template, to, data)
             ├─ Render Handlebars / MJML template
             └─ Submit to email provider (SMTP / SendGrid)
```

### Job Data Shape
```typescript
interface EmailDeliveryJob {
  to: string;
  subject: string;
  template: string;   // template name, e.g. "verify-email"
  context: Record<string, unknown>;
}
```

### Error Handling
- SMTP / provider errors → 3 retries (exponential backoff).
- Final failure is logged with the recipient address (redacted in production
  structured logs) and the error message.

---

## 6. Anomaly Detection Flow

### Purpose
Runs statistical anomaly-detection algorithms against earnings data to flag
potentially fraudulent activity.

### Trigger
Scheduled via `DailyEarningsAggregationService` cron (runs daily at midnight)
or triggered via `POST /admin/earnings/detect-anomalies`.

### Flow Diagram

```
 Cron Scheduler (daily)  or  Admin API
   └─ AnomalyDetectionService.enqueueDetection(userId)
          │
          ▼ enqueues on  anomaly-detection  queue
 AnomalyDetectionProcessor.process(job)
   ├─ Fetch recent earnings for user
   ├─ Run z-score / IQR statistical checks
   ├─ Compare against rolling 30-day baseline
   └─ If anomaly detected:
       ├─ Insert EarningAnomaly record
       └─ Emit  earning.anomaly  event (triggers admin alert)
```

### Error Handling
- Detection errors (DB timeouts, etc.) → 3 retries.
- Anomaly records are idempotent — re-running detection for the same date/user
  will not create duplicate records.

---

## Job Retries and Backoff

All queues use **exponential backoff** to avoid thundering-herd on transient
failures:

```
attempt 1 → immediate
attempt 2 → wait 2 s  (base × 2^0)
attempt 3 → wait 4 s  (base × 2^1)
attempt 4 → wait 8 s  (base × 2^2)  [payout-retry only]
attempt 5 → wait 16 s (base × 2^3)  [payout-retry only]
```

The base delay per queue:

| Queue              | Base delay | Max attempts |
|--------------------|------------|--------------|
| `clip-generation`  | 5 000 ms   | 3            |
| `clip-posting`     | 5 000 ms   | 3            |
| `nft-mint`         | 2 000 ms   | 3            |
| `payout-retry`     | 2 000 ms   | 5            |
| `email-delivery`   | 3 000 ms   | 3            |
| `anomaly-detection`| 5 000 ms   | 3            |

Job options are defined alongside each queue constant, e.g.
`CLIP_GENERATION_JOB_OPTIONS`, `NFT_MINT_JOB_OPTIONS`.

---

## Failed Jobs and Dead-Letter Handling

When a job exhausts all retry attempts it transitions to BullMQ's `failed`
state.  Failed jobs are **not** automatically removed (`removeOnFail: false`)
so they can be inspected and manually retried.

### Notifications
`JobFailureNotifierService` subscribes to the `failed` BullMQ worker event for
all queues and:
1. Logs a structured `ERROR` entry with `queue`, `jobId`, `attemptsMade`, and
   `errorMessage`.
2. Optionally sends a Slack alert (requires `SLACK_WEBHOOK_URL` env var).

### Manual Retry via Queue Dashboard
`GET  /queue-dashboard/queues` — lists all queues with depth metrics.  
`POST /queue-dashboard/queues/:queueName/jobs/:jobId/retry` — re-queues a
specific failed job.

### Queue Health
`GET /queue-dashboard/health` returns a health summary per queue:

```json
{
  "queues": [
    {
      "name": "clip-generation",
      "waiting": 0,
      "active": 1,
      "completed": 42,
      "failed": 0,
      "delayed": 0
    }
  ]
}
```

---

## API Endpoints that Create Jobs

| Method | Endpoint                          | Queue enqueued      | Async? |
|--------|-----------------------------------|---------------------|--------|
| POST   | `/videos/:id/generate-clips`      | `clip-generation`   | ✅     |
| POST   | `/clips`                          | `clip-generation`   | ✅     |
| POST   | `/clips/:id/post`                 | `clip-posting`      | ✅     |
| POST   | `/clips/:id/mint`                 | `nft-mint`          | ✅     |
| POST   | `/payouts/initiate-stellar`       | `payout-retry`*     | ✅     |
| POST   | `/admin/payouts/:id/retry`        | `payout-retry`      | ✅     |
| POST   | `/admin/earnings/detect-anomalies`| `anomaly-detection` | ✅     |

\* The `payout-retry` queue is only used for **retries**; the initial payout
attempt is synchronous but fast-fails onto the queue if Stellar is unavailable.

---

## Job Status Endpoints

Poll these to check job progress without opening a WebSocket:

| Method | Endpoint                                          | Description                        |
|--------|---------------------------------------------------|------------------------------------|
| GET    | `/jobs/:jobId`                                    | Job state, progress, result/error  |
| GET    | `/queue-dashboard/queues`                         | All queue depths                   |
| GET    | `/queue-dashboard/queues/:queueName/jobs/:jobId`  | Single job detail                  |

Returned job states: `waiting` → `active` → `completed` | `failed` | `delayed`.

---

## Asynchronous Response Pattern

Endpoints that enqueue jobs follow this convention:

**Immediate HTTP response (202 Accepted)**:
```json
{
  "jobId": "clip-generation:42",
  "status": "queued",
  "message": "Clip generation started. Poll /jobs/clip-generation:42 for status."
}
```

**Poll response when active**:
```json
{
  "jobId": "clip-generation:42",
  "status": "active",
  "progress": 60
}
```

**Poll response when complete**:
```json
{
  "jobId": "clip-generation:42",
  "status": "completed",
  "result": {
    "clipId": 123,
    "clipUrl": "https://res.cloudinary.com/...",
    "thumbnailUrl": "https://res.cloudinary.com/..."
  }
}
```

**Poll response when failed**:
```json
{
  "jobId": "clip-generation:42",
  "status": "failed",
  "failedReason": "FFmpeg exited with code 1: invalid input file"
}
```

For real-time updates, subscribe to the WebSocket namespace `/clips` and
listen for `clip:progress`, `clip:ready`, and `clip:failed` events.
