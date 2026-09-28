# Load Testing — BullMQ Clip-Generation Queue (#1029)

Artillery-based load tests for the clip-generation queue workers under high
concurrent load (100+ simultaneous jobs).

## Files

| File | Purpose |
| --- | --- |
| `loadtest/clip-generation.artillery.yml` | Load test phases/scenarios |
| `loadtest/clip-generation.processor.js` | Custom metrics (queue wait/processing time) |

## Running

```bash
TOKEN=<jwt> npx artillery run loadtest/clip-generation.artillery.yml
```

Requirements: backend running on `localhost:3000`, Redis reachable, and a
valid JWT for a user that owns videos. Load-test configuration is **not**
exposed through public Swagger.

## What is measured

- **Queue wait time** — enqueue → first progress update (`queue.wait_time`).
- **Processing time** — job execution duration reported by the worker
  (`queue.processing_time`).
- **Worker throughput** — jobs completed per second while the queue drains.
- **Response time distribution** — p50/p95/p99 per endpoint.
- **Failed jobs** — HTTP 5xx responses plus `GET /jobs/failed?type=clip-generation`
  sampled after the run.
- **Redis / database** — watch Redis `QLEN` (`bullmq:clip-generation:*`) and DB
  CPU/connections during the sustained phase; bottlenecks typically appear as
  rising `queue.wait_time` with flat throughput.

## API contract under load (documented endpoints)

| Endpoint | Success | Errors | Notes |
| --- | --- | --- | --- |
| `POST /clips/generate` | **201** — job queued, body includes `jobId` | **400** invalid request, **401** missing/invalid JWT, **429** too many active jobs | Asynchronous: processing happens in BullMQ workers. Rate limit: sliding window, default **max 5 active jobs per user** (`BULLMQ_CLIP_GENERATION_MAX_JOBS_PER_USER`, window `BULLMQ_CLIP_GENERATION_RATE_WINDOW_SECS`, default 3600s) |
| `GET /jobs/:jobId/progress` | **200** — progress payload | **401**, **404** unknown job | Job status endpoint used for polling |
| `GET /jobs/failed?type=clip-generation` | **200** — failed jobs | **401** | Post-run failure inspection |

### Expected status distribution during the burst phase

- Mostly `201` until each virtual user saturates the 5-active-job window.
- `429` responses are **expected and correct** under saturation — they confirm
  the `QueueRateLimitGuard` back-pressure contract. Keep `maxErrorRate` low so
  `5xx` still fails the run.
- Rate-limit headers/metadata follow the guard's response; treat `429` as the
  documented contract rather than an anomaly.

### Bottleneck checklist

1. `queue.wait_time` growing while throughput is flat → add workers / inspect
   Redis `QLEN`.
2. High `http.response_time` on `POST /clips/generate` with low `QLEN` → Redis
   or DB contention on enqueue.
3. Failed jobs climbing → check worker logs and
   `GET /jobs/failed?type=clip-generation`.

## CI

Load tests are intentionally **not** run in CI (they require a live stack and
Redis/DB). CI runs the targeted Jest suites instead — see
`.github/workflows/testing.yml`.
