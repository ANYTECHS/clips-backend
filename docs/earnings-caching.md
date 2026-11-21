# Earnings Caching Strategy

## Overview

This document describes the Redis caching layer for frequently requested earnings totals, which reduces database load and improves API response times for earnings endpoints.

## Architecture

### Cache Layers

We implement a two-tier caching strategy:

#### 1. Full Earnings Summary (`earnings:total:{userId}`)
- **Type**: `UserEarningsSummary`
- **Contents**:
  - `totalEarned`: Total earnings amount in base currency (USD)
  - `totalPaidOut`: Total paid out via completed payouts
  - `availableBalance`: Calculated as `totalEarned - totalPaidOut`
  - `currency`: Always USD (base currency)
- **Endpoint**: `GET /earnings` (dashboard view)
- **TTL**: Configured via `EARNINGS_CACHE_TTL` (default: 3600 seconds)

#### 2. Lightweight Total (`earnings:user:{userId}:total`)
- **Type**: `{ total: number; currency: string }`
- **Contents**: Just the user's total earnings and currency
- **Endpoint**: `GET /earnings` (quick summary)
- **TTL**: Configured via `EARNINGS_CACHE_TTL` (default: 3600 seconds)

### Response Consistency

The API returns identical response structures regardless of whether data comes from Redis or PostgreSQL:

```typescript
// Response is the same whether served from cache or database
{
  totalEarned: 1000.00,
  totalPaidOut: 250.00,
  availableBalance: 750.00,
  currency: "USD"
}
```

## Cache Flow

### Cache Hit
```
GET /earnings
  ↓
EarningsCacheService.getSummary(userId)
  ↓
Redis.get(earnings:total:{userId})
  ↓
Return cached summary (no DB query)
```

### Cache Miss
```
GET /earnings
  ↓
EarningsCacheService.getSummary(userId) → returns null
  ↓
EarningsService.getUserTotalEarnings(userId)
  ↓
Query PostgreSQL:
  - SELECT SUM(amountInBaseCurrency) FROM earning WHERE ...
  - SELECT SUM(amount) FROM payout WHERE status IN ['completed', 'processing']
  ↓
EarningsCacheService.setSummary(userId, summary)
  ↓
Redis.setex(earnings:total:{userId}, TTL, JSON.stringify(summary))
  ↓
Return summary
```

## Cache Invalidation

Cache is invalidated in the following scenarios:

### 1. New Earnings Created
- **Trigger**: POST /earnings webhook or direct earning creation
- **Action**: `EarningsService.invalidateUserEarningsCache(userId)`
- **Location**: `src/earnings/earnings.service.ts:createEarning()`
- **Also invalidated from**: `src/webhooks/webhooks.service.ts` (webhook handler)

### 2. Payout Completed
- **Trigger**: Payout transaction confirmed on-chain or manual completion
- **Action**: `EarningsService.invalidateUserEarningsCache(userId)` 
- **Location**: `src/payouts/payout-processing.service.ts`
- **Called in**:
  - `initiateStellarPayout()` (line ~245)
  - `batchStellarPayouts()` (line ~520)
  - `confirmStellarPayouts()` (line ~695)

### 3. Earning Deleted/Restored
- **Trigger**: Soft-delete or restore of an earning record
- **Action**: `EarningsAggregationService.invalidateUserEarningsCache(userId)`
- **Location**: `src/earnings/earnings-aggregation.service.ts`

## Redis Failure Handling

The system is designed to gracefully degrade when Redis is unavailable:

### Read Failures
```typescript
async getSummary(userId: number): Promise<CachedEarningsSummary | null> {
  try {
    const cached = await this.redis.get(this.summaryKey(userId));
    if (cached) return JSON.parse(cached);
  } catch (err) {
    this.logger.error(`Redis error reading summary cache: ${err.message}`);
    // Log and continue - caller will fall back to DB
  }
  return null; // Falls back to database query
}
```

### Write Failures
```typescript
async setSummary(userId: number, summary: CachedEarningsSummary): Promise<void> {
  try {
    await this.redis.setex(
      this.summaryKey(userId),
      this.ttlSeconds,
      JSON.stringify(summary),
    );
  } catch (err) {
    this.logger.error(`Redis error writing summary cache: ${err.message}`);
    // Silently swallow - earnings already fetched correctly
  }
}
```

### Invalidation Failures
```typescript
async invalidate(userId: number): Promise<void> {
  if (!userId) return;
  try {
    await this.redis.del(this.summaryKey(userId), this.totalKey(userId));
  } catch (err) {
    this.logger.error(`Failed to invalidate earnings cache: ${err.message}`);
    // Silently swallow - stale cache is acceptable short-term
  }
}
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `EARNINGS_CACHE_TTL` | `3600` | Cache TTL in seconds (1 hour) |
| `REDIS_HOST` | `localhost` | Redis server hostname |
| `REDIS_PORT` | `6379` | Redis server port |
| `REDIS_PASSWORD` | (optional) | Redis authentication password |

### Example .env
```env
EARNINGS_CACHE_TTL=1800          # 30 minutes
REDIS_HOST=redis.example.com
REDIS_PORT=6379
REDIS_PASSWORD=my-secure-password
```

## Performance Characteristics

### Cache Hit
- **Database queries**: 0
- **Redis queries**: 1 (key lookup)
- **Typical latency**: ~5-50ms (network + Redis)

### Cache Miss
- **Database queries**: 2 (earnings aggregate + payout aggregate)
- **Redis queries**: 1 read (miss) + 1 write (populate)
- **Typical latency**: ~50-200ms (DB + Redis)

### Memory Consumption
Per cached user:
- Summary: ~200 bytes
- Lightweight total: ~50 bytes
- **Total**: ~250 bytes per user

With 1M users and 1-hour TTL:
- **Estimated memory**: ~250 MB (not accounting for Redis overhead)

## Monitoring

### Key Metrics

1. **Cache Hit Rate**
   - Calculate: `cache_hits / (cache_hits + cache_misses)`
   - Target: > 80% for frequently accessed users
   - Monitor: CloudWatch / application metrics

2. **Cache Staleness**
   - Monitor how often cache is invalidated vs. expected TTL
   - If invalidation happens frequently, reduce TTL

3. **Redis Availability**
   - Monitor connection failures and recovery time
   - Alert if > 5% of requests encounter Redis errors

4. **Query Performance**
   - Track DB query times with cache misses
   - Should be < 200ms for aggregate queries

### Log Patterns

Look for these patterns to detect issues:

```
ERROR: Redis error reading summary cache: Connection refused
ERROR: Failed to invalidate earnings cache for user 123: TIMEOUT
```

These indicate Redis is experiencing issues and falling back to database.

## Testing

### Unit Tests
Located in `src/earnings/earnings-cache.service.spec.ts`:
- Cache hit/miss scenarios
- TTL configuration
- Graceful error handling

### Integration Tests
Located in `test/earnings-caching.integration-spec.ts`:
- Cache population flow
- Invalidation behavior
- Redis failure resilience
- Key naming patterns

### Load Testing
Use `loadtest/clip-generation.artillery.yml` with earnings endpoint:
```bash
artillery run loadtest/earnings-caching.yml
```

## Best Practices

### For Developers

1. **Always invalidate on data changes**
   - When creating/updating/deleting earnings or payouts
   - When modifying user balance-affecting data

2. **Don't expose cache internals**
   - Never return cache metadata (TTL, hit/miss info) to clients
   - Keep response identical whether from cache or DB

3. **Use appropriate TTL**
   - Shorter TTL (300s) for real-time applications
   - Longer TTL (3600s+) for dashboards
   - Consider business requirements

4. **Test Redis failures**
   - Mock Redis errors in tests
   - Verify database fallback works
   - Ensure no data inconsistencies

### For Operators

1. **Monitor Redis health**
   - Set up alerts for connection failures
   - Implement automatic failover if needed
   - Use Redis persistence (RDB/AOF)

2. **Tune memory limits**
   - Set `maxmemory-policy allkeys-lru` for automatic eviction
   - Monitor memory usage vs. allocated capacity
   - Adjust TTL if memory pressure occurs

3. **Plan for growth**
   - Monitor cache size growth over time
   - Increase Redis memory allocation proactively
   - Consider Redis Cluster for horizontal scaling

## Troubleshooting

### High Database Load Despite Caching

**Symptoms**: Database CPU/connections still high after deploying cache

**Causes**:
- Cache TTL too short
- Cache invalidation happening too frequently
- Users not hitting the same endpoints (low cache locality)

**Solutions**:
1. Check `EARNINGS_CACHE_TTL` setting
2. Review logs for `invalidate` patterns
3. Verify data changes are not excessive
4. Increase TTL if data freshness allows

### Stale Cache Data

**Symptoms**: Users see outdated earnings/balances for several minutes

**Causes**:
- Cache invalidation failed silently
- Race condition between invalidation and new request
- TTL set too high

**Solutions**:
1. Check Redis error logs
2. Verify invalidation is called in all code paths
3. Reduce TTL if consistency is critical

### Redis Connection Failures

**Symptoms**: Redis errors in logs, but earnings still work

**Causes**:
- Redis server down/restarting
- Network connectivity issues
- Authentication failure

**Solutions**:
1. Check Redis server status: `redis-cli ping`
2. Verify network connectivity
3. Validate credentials in `.env`
4. Check firewall rules
5. Review Redis server logs

## Future Improvements

1. **Distributed cache invalidation**
   - Use Redis pub/sub to invalidate across multiple instances
   - Implement cache versioning

2. **Predictive cache warming**
   - Pre-populate cache for active users
   - Batch load common earnings queries

3. **Fine-grained cache keys**
   - Cache earnings by period (daily/weekly/monthly)
   - Separate cache keys for different currencies

4. **Cache compression**
   - Store compressed JSON in Redis
   - Reduce memory footprint

5. **Analytics and reporting**
   - Track cache effectiveness metrics
   - Dashboard for cache performance
   - Automated TTL tuning based on usage patterns
