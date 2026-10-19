/**
 * #1031 — Consumer-driven contract tests (Pact) for critical endpoints.
 *
 * Contracts are defined for Auth, Clips, Videos, Earnings, Wallets, Payouts
 * and NFT/Web3 operations and are aligned with the Swagger DTOs:
 *  - src/auth/dto/token-response.dto.ts        (POST /auth/login)
 *  - src/clips/dto/clip-response.dto.ts        (GET /clips, POST /clips/generate)
 *  - src/videos/videos.controller.ts           (GET /videos)
 *  - src/earnings/earnings.controller.ts       (GET /earnings)
 *  - src/wallets/wallets.controller.ts         (GET /wallets)
 *  - src/payouts/payouts.controller.ts         (POST /payouts/request)
 *  - src/nft/nft.controller.ts                 (POST /nfts/mint)
 *
 * The Pact mock server is exercised over HTTP, verified after each
 * interaction and the resulting pact file is written to
 * src/tests/pact/pacts/. Provider verification is covered by the
 * env-gated block at the bottom (set PACT_PROVIDER_URL in CI).
 */
// Deep import: the package root re-exports the provider Verifier, which pulls
// in an ESM-only https-proxy-agent build that Jest cannot load by default.
import { Pact } from '@pact-foundation/pact/src/httpPact';

jest.setTimeout(30000);

const CONSUMER = 'clips-frontend';
const PROVIDER = 'clips-backend-api';

describe('API contract tests — Pact (#1031)', () => {
  const pact = new Pact({
    consumer: CONSUMER,
    provider: PROVIDER,
    dir: 'src/tests/pact/pacts',
    logLevel: 'error',
  } as any);

  const baseUrl = (): string => (pact as any).mockService.baseUrl;

  const exercise = async (
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
  ): Promise<{ status: number; body: any }> => {
    const res = await (globalThis as any).fetch(`${baseUrl()}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-token',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
  };

  /**
   * `setup()` allocates a free port, `addInteraction()` binds the mock server to
   * it, and `verify()` tears that port down again. Running setup once per test
   * — and clearing the cached port so a *new* one is allocated — gives every
   * interaction a fresh port, so the server is never rebound while the previous
   * listener is still releasing the old one. That race caused the intermittent
   * ECONNREFUSED / "expected but not received" failures in this CI step.
   */
  beforeEach(async () => {
    (pact as any).opts.port = undefined;
    await (pact as any).setup();
  });

  afterEach(async () => {
    await (pact as any).verify();
  });

  afterAll(async () => {
    await (pact as any).finalize();
  });

  it('Auth — POST /auth/login returns 200 with TokenResponseDto fields', async () => {
    await pact.addInteraction({
      state: 'a registered user exists',
      uponReceiving: 'a login request with valid credentials',
      withRequest: {
        method: 'POST',
        path: '/auth/login',
        headers: { 'Content-Type': 'application/json' },
        body: { email: 'founder@example.com', password: 'Sup3rSecret!' },
      },
      willRespondWith: {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: {
          accessToken: 'eyJhbGciOiJIUzI1NiJ9...',
          refreshToken: 'a1b2c3d4e5f6...',
        },
      },
    });

    const res = await exercise('POST', '/auth/login', {
      email: 'founder@example.com',
      password: 'Sup3rSecret!',
    });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('accessToken');
    expect(res.body).toHaveProperty('refreshToken');
  });

  it('Auth — POST /auth/login returns 401 for invalid credentials', async () => {
    await pact.addInteraction({
      state: 'a registered user exists',
      uponReceiving: 'a login request with a wrong password',
      withRequest: {
        method: 'POST',
        path: '/auth/login',
        headers: { 'Content-Type': 'application/json' },
        body: { email: 'founder@example.com', password: 'wrong-password' },
      },
      willRespondWith: {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
        body: { statusCode: 401, message: 'Invalid credentials' },
      },
    });

    const res = await exercise('POST', '/auth/login', {
      email: 'founder@example.com',
      password: 'wrong-password',
    });

    expect(res.status).toBe(401);
    expect(res.body.statusCode).toBe(401);
  });

  it('Clips — GET /clips returns 200 with ClipResponseDto items', async () => {
    await pact.addInteraction({
      state: 'the user has clips',
      uponReceiving: 'a request to list clips',
      withRequest: {
        method: 'GET',
        path: '/clips',
        query: { page: '1' },
        headers: { Authorization: 'Bearer test-token' },
      },
      willRespondWith: {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: [
          {
            id: 42,
            videoId: 7,
            title: 'My clip',
            status: 'ready',
            royaltyBps: 500,
          },
        ],
      },
    });

    const res = await exercise('GET', '/clips?page=1');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0]).toMatchObject({ id: 42, videoId: 7 });
  });

  it('Clips — POST /clips/generate queues a job (201) and rate limits (429)', async () => {
    await pact.addInteraction({
      state: 'the user is below the active job limit',
      uponReceiving: 'a clip-generation job request',
      withRequest: {
        method: 'POST',
        path: '/clips/generate',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-token',
        },
        body: { videoId: 7 },
      },
      willRespondWith: {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
        body: { jobId: 'clip-123', queue: 'clip-generation', status: 'queued' },
      },
    });

    const res = await exercise('POST', '/clips/generate', { videoId: 7 });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('jobId');
  });

  it('Clips — POST /clips/generate returns 429 when the queue is saturated', async () => {
    await pact.addInteraction({
      state: 'the user has reached the maximum of 5 active jobs',
      uponReceiving: 'another clip-generation job request',
      withRequest: {
        method: 'POST',
        path: '/clips/generate',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-token',
        },
        body: { videoId: 8 },
      },
      willRespondWith: {
        status: 429,
        headers: { 'Content-Type': 'application/json' },
        body: { statusCode: 429, message: 'Too many active jobs (max 5)' },
      },
    });

    const res = await exercise('POST', '/clips/generate', { videoId: 8 });
    expect(res.status).toBe(429);
    expect(res.body.statusCode).toBe(429);
  });

  it('Videos — GET /videos returns 200 with the video list', async () => {
    await pact.addInteraction({
      state: 'the user has uploaded videos',
      uponReceiving: 'a request to list videos',
      withRequest: {
        method: 'GET',
        path: '/videos',
        headers: { Authorization: 'Bearer test-token' },
      },
      willRespondWith: {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: [{ id: 7, title: 'Source video', status: 'processed' }],
      },
    });

    const res = await exercise('GET', '/videos');
    expect(res.status).toBe(200);
    expect(res.body[0]).toMatchObject({ id: 7 });
  });

  it('Earnings — GET /earnings returns 200 with earnings items', async () => {
    await pact.addInteraction({
      state: 'the user has earnings',
      uponReceiving: 'a request to list earnings',
      withRequest: {
        method: 'GET',
        path: '/earnings',
        headers: { Authorization: 'Bearer test-token' },
      },
      willRespondWith: {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: [
          {
            id: 1,
            clipId: 42,
            amount: 12.5,
            currency: 'USD',
            source: 'royalty',
          },
        ],
      },
    });

    const res = await exercise('GET', '/earnings');
    expect(res.status).toBe(200);
    expect(res.body[0]).toMatchObject({ id: 1, currency: 'USD' });
  });

  it('Wallets — GET /wallets returns 200 with connected wallets', async () => {
    await pact.addInteraction({
      state: 'the user has a connected wallet',
      uponReceiving: 'a request to list wallets',
      withRequest: {
        method: 'GET',
        path: '/wallets',
        headers: { Authorization: 'Bearer test-token' },
      },
      willRespondWith: {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: [
          {
            id: 1,
            address: 'GABC123',
            chain: 'stellar',
            type: 'custodial',
          },
        ],
      },
    });

    const res = await exercise('GET', '/wallets');
    expect(res.status).toBe(200);
    expect(res.body[0]).toHaveProperty('address');
  });

  it('Payouts — POST /payouts/request returns 201 for a payout request', async () => {
    await pact.addInteraction({
      state: 'the user has sufficient balance',
      uponReceiving: 'a payout request',
      withRequest: {
        method: 'POST',
        path: '/payouts/request',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-token',
        },
        body: { amount: 100, currency: 'USD', method: 'stellar' },
      },
      willRespondWith: {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
        body: { id: 10, amount: 100, currency: 'USD', status: 'pending' },
      },
    });

    const res = await exercise('POST', '/payouts/request', {
      amount: 100,
      currency: 'USD',
      method: 'stellar',
    });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('pending');
  });

  it('Web3 — POST /nfts/mint returns 201 with a mint job id', async () => {
    await pact.addInteraction({
      state: 'the collection allows minting',
      uponReceiving: 'an NFT mint request',
      withRequest: {
        method: 'POST',
        path: '/nfts/mint',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-token',
        },
        body: { to: 'GABC123', metadata: { name: 'Clip #42' } },
      },
      willRespondWith: {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
        body: { jobId: 'mint-1', status: 'queued' },
      },
    });

    const res = await exercise('POST', '/nfts/mint', {
      to: 'GABC123',
      metadata: { name: 'Clip #42' },
    });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('jobId');
  });

  // ── Provider verification (CI) ────────────────────────────────────────────
  // Runs only when a base URL of a live provider is supplied, e.g. in CI:
  //   PACT_PROVIDER_URL=http://localhost:3000 npm test -- tests/pact
  const liveUrl = process.env.PACT_PROVIDER_URL;
  const providerIt = liveUrl ? it : it.skip;

  providerIt(
    'verifies all consumer contracts against the live provider',
    async () => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { Verifier } = require('@pact-foundation/pact');
      const path = require('node:path');
      const verifier = new Verifier({
        providerBaseUrl: liveUrl,
        pactUrls: [path.resolve('src/tests/pact/pacts')],
        providerVersion: process.env.GIT_COMMIT ?? '0.0.0',
        logLevel: 'warn',
      });
      await verifier.verifyProvider();
    },
  );
});
