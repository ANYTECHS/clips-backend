# Queue Health Metrics & Schema Implementation

## Branch
`feature/queue-health-metrics-and-schema`

## Tasks Completed

### 1. Return Queue Health Metrics ✅
**File:** `src/health/health.controller.ts`
- Added `GET /health/queues` endpoint
- Returns `QueueHealthResponseDto` with:
  - Overall system health status (healthy/degraded/unhealthy)
  - Per-queue health metrics including job counts and failure rates
  - System-wide failure rate
  - Timestamp of health check

**File:** `src/queue/queue-health.service.ts`
- `getQueueHealth()` method calculates health for all queues
- Determines health status based on:
  - Failure rate > 20% → unhealthy
  - Failure rate > 10% → degraded
  - Otherwise → healthy
- Tracks job counts: waiting, active, completed, failed, delayed, prioritized
- Calculates average retry count and failure rate per queue

---

### 2 & 3. Define API Response Schemas for Queue Statistics ✅
**File:** `src/queue/dtos/queue-stats.dto.ts`

Created comprehensive DTOs with full Swagger documentation:

#### `QueueJobCountDto`
- Fields: waiting, active, completed, failed, delayed, prioritized
- Usage: Represents job counts in each state

#### `QueueHealthDto`
- Fields: queue name, status, jobs, totalJobs, failureRate, avgRetryCount, timestamp
- Usage: Individual queue health snapshot

#### `QueueHealthResponseDto`
- Fields: status, queues[], totalJobsAcrossQueues, systemWideFailureRate, timestamp
- Usage: Response for `/health/queues` endpoint

#### `QueueStatisticsDto`
- Fields: queue, jobCounts, totalProcessed, successCount, failureCount, failureRate, avgProcessingTimeSeconds, avgRetryCount, failureReasonCounts, timestamp
- Usage: Detailed statistics for a single queue

#### `QueueStatisticsResponseDto`
- Fields: queues[], timestamp
- Usage: Response for `/health/queues/statistics` endpoint

---

### 4. Centralize Retry and Backoff Configuration ✅
**File:** `src/queue/retry-backoff-config.service.ts`

Provides centralized management of retry and backoff strategies:

#### Key Features:
- **Per-Queue Configuration**: Each queue has its own default retry settings
- **Environment Variable Overrides**: `RETRY_BACKOFF_{QUEUE}_ATTEMPTS`, `RETRY_BACKOFF_{QUEUE}_DELAY_MS`, `RETRY_BACKOFF_{QUEUE}_MULTIPLIER`
- **Default Configurations**:
  - clip-generation: 5 attempts, 2000ms exponential backoff
  - nft-mint: 3 attempts, 1000ms exponential backoff
  - clip-posting: 4 attempts, 1500ms exponential backoff
  - email-delivery: 3 attempts, 1000ms exponential backoff
  - anomaly-detection: 3 attempts, 2000ms exponential backoff

#### Public Methods:
- `getRetryConfig(queueName)` - Get config for specific queue
- `getBullMQRetryConfig(queueName)` - Get BullMQ-compatible format
- `getAllRetryConfigs()` - Get all queue configurations
- `getMaxTotalJobTimeMs(queueName)` - Calculate max retry duration
- `getRetryInfo(queueName)` - Get detailed retry information with breakdown per attempt

---

## New API Endpoints

### `GET /health/queues`
Returns health metrics for all BullMQ queues
- **Response**: `QueueHealthResponseDto`
- **Status Codes**: 
  - 200: All queues healthy
  - 503: One or more queues unhealthy
- **Example Response**:
```json
{
  "status": "healthy",
  "queues": [
    {
      "queue": "clip-generation",
      "status": "healthy",
      "jobs": {
        "waiting": 10,
        "active": 2,
        "completed": 150,
        "failed": 5,
        "delayed": 3,
        "prioritized": 1
      },
      "totalJobs": 171,
      "failureRate": 3.2,
      "avgRetryCount": 1.2,
      "timestamp": "2026-06-27T10:30:45.123Z"
    }
  ],
  "totalJobsAcrossQueues": 500,
  "systemWideFailureRate": 2.8,
  "timestamp": "2026-06-27T10:30:45.123Z"
}
```

### `GET /health/queues/statistics`
Returns detailed statistics for all queues
- **Response**: `QueueStatisticsResponseDto`
- **Status Code**: 200
- **Includes**:
  - Job counts by state
  - Success/failure counts
  - Average processing time in seconds
  - Failure reasons breakdown
  - Failure rate percentage

---

## Module Updates

### `src/health/health.module.ts`
- Added imports: `QueueModule`
- Added providers: `QueueHealthService`, `RetryBackoffConfigService`
- Added exports: `QueueHealthService`, `RetryBackoffConfigService`

### `src/queue/queue.module.ts`
- Added providers: `RetryBackoffConfigService`, `QueueHealthService`
- Added exports: `RetryBackoffConfigService`, `QueueHealthService`

---

## Integration Points

### Health Controller
- Injects `QueueHealthService`
- New endpoints leverage existing Swagger documentation patterns
- Error handling with appropriate HTTP status codes

### Existing Services
- No breaking changes to existing queue services
- `RetryBackoffConfigService` can be injected into any service needing retry configuration
- `QueueHealthService` monitors all registered queues

---

## Environment Variables

### Retry/Backoff Configuration
```
RETRY_BACKOFF_CLIP_GENERATION_ATTEMPTS=5
RETRY_BACKOFF_CLIP_GENERATION_DELAY_MS=2000
RETRY_BACKOFF_CLIP_GENERATION_MULTIPLIER=2

RETRY_BACKOFF_NFT_MINT_ATTEMPTS=3
RETRY_BACKOFF_NFT_MINT_DELAY_MS=1000
RETRY_BACKOFF_NFT_MINT_MULTIPLIER=2

# ... and so on for other queues
```

---

## Files Created

1. `src/queue/dtos/queue-stats.dto.ts` - API response schemas
2. `src/queue/retry-backoff-config.service.ts` - Centralized retry configuration
3. `src/queue/queue-health.service.ts` - Queue health metrics service

## Files Modified

1. `src/health/health.controller.ts` - Added two new endpoints
2. `src/health/health.module.ts` - Updated module imports/exports/providers
3. `src/queue/queue.module.ts` - Updated module providers/exports

---

## Next Steps

1. Run `npm run build` to compile and verify no TypeScript errors
2. Run `npm run test` to ensure no regressions
3. Test the new endpoints:
   - `curl http://localhost:3000/health/queues`
   - `curl http://localhost:3000/health/queues/statistics`
4. Verify Swagger documentation updated automatically
5. Commit and push to create PR

---

## Key Design Decisions

1. **Service Separation**: Health metrics in separate service for maintainability
2. **Centralized Configuration**: All retry logic in one place for consistency
3. **Environment Variable Support**: Allows ops teams to tune without code changes
4. **Graceful Degradation**: Health checks handle unavailable queues gracefully
5. **Comprehensive DTOs**: All Swagger documentation included for API clarity
