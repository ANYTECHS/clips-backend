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
  const state = { count: opts.redis?.count ?? 0 };
  const redisService = {
    isAvailable: () => opts.redis?.isAvailable ?? true,
    incr: async (_k: string) => {
      calls.push('incr');
      state.count += 1;
      return state.count;
    },
    decr: async (_k: string) => {
      calls.push('decr');
      state.count -= 1;
      return state.count;
    },
    expire: async (_k: string, _s: number) => {
      calls.push('expire');
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
  return { guard, calls, reflector };
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
});
