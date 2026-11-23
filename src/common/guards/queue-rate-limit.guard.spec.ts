import { HttpStatus } from '@nestjs/common';
import {
  QueueRateLimitGuard,
  QUEUE_RATE_LIMIT_KEY,
} from './queue-rate-limit.guard';

function makeContext(opts: {
  metadata?: { queue: string; maxJobs: number; windowSecs?: number };
  userId?: number;
  headers?: Record<string, string>;
}) {
  const setHeaders: Record<string, string> = {};
  const response = {
    setHeader: (k: string, v: string) => {
      setHeaders[k] = v;
    },
  };
  const request = {
    user: opts.userId ? { userId: opts.userId } : undefined,
  };
  const context = {
    getHandler: () => ({}),
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }),
  } as any;
  return { context, setHeaders };
}

function makeGuard(opts: {
  metadata?: { queue: string; maxJobs: number; windowSecs?: number };
  redis?: Partial<{
    isAvailable: boolean;
    count: number;
    ttl: number;
    calls: string[];
  }>;
  env?: Record<string, string>;
}) {
  const calls: string[] = opts.redis?.calls ?? [];
  const counts = new Map<string, number>();
  const expires: Array<{ key: string; secs: number }> = [];
  const seed = opts.redis?.count ?? 0;
  const redisService = {
    isAvailable: () => opts.redis?.isAvailable ?? true,
    incr: async (k: string) => {
      calls.push('incr');
      const next = (counts.get(k) ?? seed) + 1;
      counts.set(k, next);
      return next;
    },
    decr: async (k: string) => {
      calls.push('decr');
      const next = (counts.get(k) ?? seed) - 1;
      counts.set(k, next);
      return next;
    },
    expire: async (k: string, secs: number) => {
      calls.push('expire');
      expires.push({ key: k, secs });
      return true;
    },
    ttl: async (_k: string) => {
      calls.push('ttl');
      return opts.redis?.ttl ?? 60;
    },
  };
  const reflector = {
    get: (_key: string, _handler: unknown) => opts.metadata,
  };
  const configService = {
    get: (key: string, fallback: string) => opts.env?.[key] ?? fallback,
  };
  const guard = new QueueRateLimitGuard(
    redisService as any,
    reflector as any,
    configService as any,
  );
  return { guard, calls, expires, counts, reflector };
}

describe('QueueRateLimitGuard (#900)', () => {
  it('passes when no rate-limit metadata is attached', async () => {
    const { guard } = makeGuard({});
    const { context } = makeContext({ userId: 7 });
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('passes unauthenticated requests through', async () => {
    const { guard } = makeGuard({
      metadata: { queue: 'clip-generation', maxJobs: 5 },
    });
    const { context } = makeContext({});
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('allows requests under the limit', async () => {
    const { guard, calls } = makeGuard({
      metadata: { queue: 'clip-generation', maxJobs: 5 },
      redis: { count: 2 },
    });
    const { context } = makeContext({ userId: 7 });
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(calls).toContain('incr');
    expect(calls).not.toContain('decr');
  });

  it('rejects with 429, Retry-After header and rolls back the increment', async () => {
    const { guard, calls } = makeGuard({
      metadata: { queue: 'nft-mint', maxJobs: 5 },
      redis: { count: 5, ttl: 42 },
    });
    const { context, setHeaders } = makeContext({ userId: 9 });
    const err = await guard.canActivate(context).catch((e) => e);
    expect(err?.status).toBe(HttpStatus.TOO_MANY_REQUESTS);
    expect(err?.response?.retryAfter).toBe(42);
    expect(setHeaders['Retry-After']).toBe('42');
    expect(calls).toContain('decr');
  });

  it('honours BULLMQ_{QUEUE}_MAX_JOBS_PER_USER env override', async () => {
    const { guard } = makeGuard({
      metadata: { queue: 'clip-generation', maxJobs: 5 },
      redis: { count: 7 },
      env: { BULLMQ_CLIP_GENERATION_MAX_JOBS_PER_USER: '10' },
    });
    const { context } = makeContext({ userId: 7 });
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('fails open when Redis is unavailable', async () => {
    const { guard, calls } = makeGuard({
      metadata: { queue: 'clip-generation', maxJobs: 1 },
      redis: { isAvailable: false },
    });
    const { context } = makeContext({ userId: 7 });
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(calls).not.toContain('incr');
  });

  it('uses QUEUE_RATE_LIMIT_KEY metadata key', () => {
    expect(QUEUE_RATE_LIMIT_KEY).toBe('queue_rate_limit');
  });

  it('sets the window TTL only on the first request for a user', async () => {
    const { guard, expires } = makeGuard({
      metadata: { queue: 'clip-generation', maxJobs: 5 },
      redis: { count: 0 },
    });
    const { context } = makeContext({ userId: 1 });
    await guard.canActivate(context);
    await guard.canActivate(context);
    expect(expires).toHaveLength(1);
    expect(expires[0].secs).toBe(3600); // default window
  });

  it('resets the window using the configurable windowSecs default', async () => {
    const { guard, expires } = makeGuard({
      metadata: { queue: 'clip-generation', maxJobs: 5, windowSecs: 120 },
      redis: { count: 0 },
    });
    const { context } = makeContext({ userId: 1 });
    await guard.canActivate(context);
    expect(expires).toHaveLength(1);
    expect(expires[0].secs).toBe(120);
  });

  it('honours BULLMQ_{QUEUE}_RATE_WINDOW_SECS env override', async () => {
    const { guard, expires } = makeGuard({
      metadata: { queue: 'nft-mint', maxJobs: 5, windowSecs: 3600 },
      redis: { count: 0 },
      env: { BULLMQ_NFT_MINT_RATE_WINDOW_SECS: '900' },
    });
    const { context } = makeContext({ userId: 1 });
    await guard.canActivate(context);
    expect(expires).toHaveLength(1);
    expect(expires[0].secs).toBe(900);
  });

  it('allows the request exactly at the limit and rejects the next one', async () => {
    const { guard } = makeGuard({
      metadata: { queue: 'clip-generation', maxJobs: 5 },
      redis: { count: 4 },
    });
    const { context } = makeContext({ userId: 3 });
    await expect(guard.canActivate(context)).resolves.toBe(true); // 5th — allowed
    await expect(guard.canActivate(context)).rejects.toMatchObject({
      status: HttpStatus.TOO_MANY_REQUESTS, // 6th — rejected
    });
  });

  it('tracks limits per user (isolation)', async () => {
    const { guard } = makeGuard({
      metadata: { queue: 'clip-generation', maxJobs: 5 },
      redis: { count: 0 },
    });
    const userA = makeContext({ userId: 11 });
    const userB = makeContext({ userId: 22 });

    for (let i = 0; i < 5; i += 1) {
      await expect(guard.canActivate(userA.context)).resolves.toBe(true);
    }
    await expect(guard.canActivate(userA.context)).rejects.toMatchObject({
      status: HttpStatus.TOO_MANY_REQUESTS,
    });

    // A different user keeps an independent counter.
    await expect(guard.canActivate(userB.context)).resolves.toBe(true);
  });
});
