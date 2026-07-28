# API Rate Limits

ClipCash API implements comprehensive rate limiting to ensure fair usage, prevent abuse, and maintain system stability for all users.

## Overview

Rate limits are applied per IP address and reset automatically after the specified time window. All limits are enforced using Redis-backed throttling for distributed deployments.

## Rate Limit Tiers

### Default Tier
- **Limit:** 100 requests per 60 seconds
- **Applies to:** Most general API endpoints
- **Use case:** Standard API operations, listing resources, fetching data

### Auth Tier
- **Limit:** 10 requests per 60 seconds
- **Applies to:** 
  - `POST /auth/login`
  - `POST /auth/register`
  - `POST /auth/password-reset`
  - `POST /auth/google`
- **Use case:** Authentication operations to prevent brute force attacks

### Sensitive Tier
- **Limit:** 3 requests per 15 minutes (900 seconds)
- **Applies to:**
  - `POST /auth/mfa/enable`
  - `DELETE /users/:id`
  - `PUT /users/:id/change-password`
- **Use case:** Critical security operations requiring additional protection

### Email Verification Tier
- **Limit:** 3 requests per 60 minutes (3600 seconds)
- **Applies to:**
  - `POST /auth/resend-verification`
- **Use case:** Prevents spam and abuse of email services

### Clip Generation Tier
- **Limit:** 10 requests per 60 seconds
- **Applies to:**
  - `POST /clips/generate`
  - `POST /videos/:id/clips`
- **Use case:** Resource-intensive video processing operations

### NFT Mint Tier
- **Limit:** 5 requests per 60 seconds
- **Applies to:**
  - `POST /clips/:id/mint`
  - `POST /nft/mint`
- **Use case:** Blockchain operations with gas costs

### Wallet Connect Tier
- **Limit:** 10 requests per 60 seconds
- **Applies to:**
  - `POST /wallets/connect`
- **Use case:** Wallet connection operations

### Wallet Disconnect Tier
- **Limit:** 10 requests per 60 seconds
- **Applies to:**
  - `DELETE /wallets/:id`
- **Use case:** Wallet disconnection operations

### Transaction Send Tier
- **Limit:** 5 requests per 60 seconds
- **Applies to:**
  - `POST /payouts`
  - `POST /transactions/send`
- **Use case:** Blockchain transaction submissions

## Response Headers

Every API response includes rate limit information in the following headers:

```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1704067200
```

### Header Descriptions

| Header | Description | Example |
|--------|-------------|---------|
| `X-RateLimit-Limit` | Maximum number of requests allowed in the current window | `100` |
| `X-RateLimit-Remaining` | Number of requests remaining in the current window | `95` |
| `X-RateLimit-Reset` | Unix timestamp (seconds) when the rate limit window resets | `1704067200` |

## Rate Limit Exceeded Response

When you exceed the rate limit, the API returns a `429 Too Many Requests` status code:

```json
{
  "statusCode": 429,
  "message": "ThrottlerException: Too Many Requests",
  "error": "Too Many Requests"
}
```

The response also includes the standard rate limit headers showing when the limit will reset.

## Best Practices

### 1. Monitor Rate Limit Headers
Always check the `X-RateLimit-Remaining` header to know how many requests you have left.

```typescript
const response = await fetch('https://api.clipcash.io/clips');
const remaining = response.headers.get('X-RateLimit-Remaining');

if (parseInt(remaining) < 10) {
  console.warn('Approaching rate limit!');
}
```

### 2. Implement Exponential Backoff
When you receive a `429` response, implement exponential backoff before retrying:

```typescript
async function fetchWithRetry(url: string, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    const response = await fetch(url);
    
    if (response.status === 429) {
      const resetTime = parseInt(response.headers.get('X-RateLimit-Reset'));
      const waitTime = Math.min((resetTime * 1000) - Date.now(), 60000);
      
      await new Promise(resolve => setTimeout(resolve, waitTime));
      continue;
    }
    
    return response;
  }
  
  throw new Error('Max retries exceeded');
}
```

### 3. Cache Responses
Reduce API calls by caching responses that don't change frequently:

```typescript
const cache = new Map();

async function getCachedClips(videoId: string) {
  if (cache.has(videoId)) {
    return cache.get(videoId);
  }
  
  const clips = await fetch(`/videos/${videoId}/clips`).then(r => r.json());
  cache.set(videoId, clips);
  
  // Cache for 5 minutes
  setTimeout(() => cache.delete(videoId), 5 * 60 * 1000);
  
  return clips;
}
```

### 4. Use Webhooks Instead of Polling
For real-time updates, use webhooks instead of repeatedly polling endpoints:

```typescript
// ❌ Bad: Polling every second
setInterval(async () => {
  const status = await fetch('/clips/123/status');
  // ...
}, 1000);

// ✅ Good: Use WebSocket or webhook
const socket = new WebSocket('wss://api.clipcash.io');
socket.on('clip:status', (data) => {
  // Handle status update
});
```

### 5. Batch Requests When Possible
Group multiple operations into a single request if the API supports it:

```typescript
// ❌ Bad: Multiple requests
for (const clip of clips) {
  await fetch(`/clips/${clip.id}`, { method: 'DELETE' });
}

// ✅ Good: Batch delete (if supported)
await fetch('/clips/bulk-delete', {
  method: 'POST',
  body: JSON.stringify({ clipIds: clips.map(c => c.id) })
});
```

## IP Whitelisting

For production integrations requiring higher limits, you can request IP whitelisting by contacting support.

### Configuration (Server-Side)
Set the `THROTTLER_WHITELIST` environment variable with comma-separated IPs:

```env
THROTTLER_WHITELIST=192.168.1.100,10.0.0.50
```

Whitelisted IPs bypass all rate limits.

## Configuration (Developers)

Rate limits are configured in `src/app.module.ts`:

```typescript
ThrottlerModule.forRootAsync({
  throttlers: [
    {
      name: 'default',
      ttl: 60000,      // 60 seconds
      limit: 100,      // 100 requests
    },
    {
      name: 'auth',
      ttl: 60000,      // 60 seconds
      limit: 10,       // 10 requests
    },
    // ... more tiers
  ],
})
```

To apply a specific tier to a controller or route:

```typescript
import { Throttle } from '@nestjs/throttler';

@Controller('clips')
export class ClipsController {
  @Post('generate')
  @Throttle({ clipGenerate: { ttl: 60000, limit: 10 } })
  async generateClips() {
    // ...
  }
}
```

## Testing Rate Limits

You can test rate limits in development:

```bash
# Send 15 requests to auth endpoint (limit: 10)
for i in {1..15}; do
  curl -X POST http://localhost:3000/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"test@example.com","password":"wrong"}' \
    -i | grep -E "HTTP|X-RateLimit"
done
```

Expected output:
- Requests 1-10: `200 OK` or `401 Unauthorized`
- Requests 11-15: `429 Too Many Requests`

## Production Considerations

### Scaling
Rate limits are enforced using Redis, which allows consistent limits across multiple server instances in a load-balanced environment.

### Monitoring
Monitor rate limit hits using the `/metrics` endpoint:

```prometheus
# Rate limit rejections by endpoint
clipcash_http_request_duration_seconds{status_code="429"}
```

### Adjusting Limits
If your use case requires different limits, contact the development team or submit a pull request with justification.

## Support

For questions or issues related to rate limits:
- Open an issue: [GitHub Issues](https://github.com/ANYTECHS/clips-backend/issues)
- Contact support: support@clipcash.io
- Request higher limits: api@clipcash.io
