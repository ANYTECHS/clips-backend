import { Pact } from '@pact-foundation/pact/src/httpPact';
import * as fs from 'node:fs';
import * as path from 'node:path';

jest.setTimeout(30000);

const pactDir = path.resolve('.temp/api-contract-pacts');
const pactFile = path.join(pactDir, 'clips-frontend-clips-backend-api.json');
const committedPactFile = path.resolve(
  'src/tests/pact/pacts/clips-frontend-clips-backend-api.json',
);
let pact: Pact;

async function request(
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
  authenticated = true,
): Promise<{ status: number; body: unknown }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (authenticated) headers.Authorization = 'Bearer test-token';

  const response = await fetch(`${pact.mockService.baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  return { status: response.status, body: await response.json() };
}

describe('clips-frontend API consumer contracts', () => {
  beforeAll(() => {
    fs.mkdirSync(pactDir, { recursive: true });
    if (fs.existsSync(pactFile)) fs.unlinkSync(pactFile);
  });

  beforeEach(async () => {
    pact = new Pact({
      consumer: 'clips-frontend',
      provider: 'clips-backend-api',
      dir: pactDir,
      pactfileWriteMode: 'merge',
      logLevel: 'error',
    });
    await pact.setup();
  });

  afterEach(async () => {
    try {
      await pact.verify();
    } finally {
      await pact.finalize();
    }
  });

  afterAll(() => {
    if (!fs.existsSync(pactFile)) {
      throw new Error('Pact did not generate the consumer contract file');
    }
    fs.copyFileSync(pactFile, committedPactFile);
    fs.unlinkSync(pactFile);
  });

  it('documents login request and response DTOs', async () => {
    await pact.addInteraction({
      state: 'a registered user exists',
      uponReceiving: 'valid login credentials',
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
          user: {
            id: 1,
            email: 'founder@example.com',
            name: 'Founder',
            picture: null,
            mfaEnabled: false,
            emailVerified: true,
          },
          tokens: {
            accessToken: 'access-token',
            refreshToken: 'refresh-token',
          },
          csrfToken: 'csrf-token',
        },
      },
    });

    const result = await request('POST', '/auth/login', {
      email: 'founder@example.com',
      password: 'Sup3rSecret!',
    });
    expect(result.status).toBe(200);
    if (!isRecord(result.body) || !isRecord(result.body.tokens)) {
      throw new Error(
        'Login response did not contain the documented token object',
      );
    }
    expect(typeof result.body.csrfToken).toBe('string');
    expect(typeof result.body.tokens.accessToken).toBe('string');
    expect(typeof result.body.tokens.refreshToken).toBe('string');
  });

  it('requires bearer authentication for clips', async () => {
    await pact.addInteraction({
      uponReceiving: 'a clip list request without a bearer token',
      withRequest: { method: 'GET', path: '/clips' },
      willRespondWith: {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
        body: {
          statusCode: 401,
          errorCode: 'UNAUTHORIZED',
          message: 'Authentication required',
        },
      },
    });

    const result = await request('GET', '/clips', undefined, false);
    expect(result.status).toBe(401);
  });

  it('lists clips using the documented ClipResponseDto', async () => {
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
            selected: false,
            nftStatus: 'none',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
            royaltyBps: 500,
          },
        ],
      },
    });

    const result = await request('GET', '/clips?page=1');
    expect(result.status).toBe(200);
    expect(result.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 42, videoId: 7, selected: false }),
      ]),
    );
  });

  it('lists videos using the documented response schema', async () => {
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
        body: { message: 'Videos endpoint' },
      },
    });

    const result = await request('GET', '/videos');
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ message: 'Videos endpoint' });
  });

  it('returns the documented earnings total', async () => {
    await pact.addInteraction({
      state: 'the user has earnings',
      uponReceiving: 'a request for the earnings total',
      withRequest: {
        method: 'GET',
        path: '/earnings',
        headers: { Authorization: 'Bearer test-token' },
      },
      willRespondWith: {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: { total: 2500.5, currency: 'USD' },
      },
    });

    const result = await request('GET', '/earnings');
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ total: 2500.5, currency: 'USD' });
  });

  it('lists wallets using the documented wallet response schema', async () => {
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
            address: 'GABF...KJ93XD',
            chain: 'stellar',
            type: 'freighter',
            connectedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
      },
    });

    const result = await request('GET', '/wallets');
    expect(result.status).toBe(200);
    expect(result.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 1, chain: 'stellar' }),
      ]),
    );
  });

  it('creates a payout with the documented request and response DTOs', async () => {
    await pact.addInteraction({
      state: 'the user has sufficient balance',
      uponReceiving: 'a Stellar payout request',
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
        body: {
          payoutId: 'payout_123',
          status: 'pending',
          id: 10,
          amount: 100,
          currency: 'USD',
          method: 'stellar',
          createdAt: '2026-01-01T00:00:00.000Z',
          feeAmount: 2.5,
          finalAmount: 97.5,
        },
      },
    });

    const result = await request('POST', '/payouts/request', {
      amount: 100,
      currency: 'USD',
      method: 'stellar',
    });
    expect(result.status).toBe(201);
    expect(result.body).toEqual(
      expect.objectContaining({ payoutId: 'payout_123', status: 'pending' }),
    );
  });

  it('mints an NFT using the documented request and response DTOs', async () => {
    await pact.addInteraction({
      state: 'the user owns a mintable clip and its collection is available',
      uponReceiving: 'an authenticated NFT mint request',
      withRequest: {
        method: 'POST',
        path: '/nfts/mint',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-token',
        },
        body: {
          clipId: 42,
          creatorWallet:
            'GC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3',
        },
      },
      willRespondWith: {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
        body: {
          collectionId: 'viral-clips',
          clipId: '42',
          creatorWallet:
            'GC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3',
          metadataUri: 'ipfs://QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG',
          royaltyBps: 1000,
          royalties: [
            {
              wallet:
                'GC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3',
              bps: 1000,
              label: 'creator',
            },
          ],
          status: 'minted',
        },
      },
    });

    const result = await request('POST', '/nfts/mint', {
      clipId: 42,
      creatorWallet: 'GC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3',
    });
    expect(result.status).toBe(201);
    expect(result.body).toEqual(
      expect.objectContaining({
        collectionId: 'viral-clips',
        clipId: '42',
        status: 'minted',
      }),
    );
  });

  it('requires bearer authentication for NFT minting', async () => {
    await pact.addInteraction({
      uponReceiving: 'an NFT mint request without a bearer token',
      withRequest: {
        method: 'POST',
        path: '/nfts/mint',
        headers: { 'Content-Type': 'application/json' },
        body: {
          clipId: 42,
          creatorWallet:
            'GC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3',
        },
      },
      willRespondWith: {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
        body: {
          statusCode: 401,
          errorCode: 'UNAUTHORIZED',
          message: 'Authentication required',
        },
      },
    });

    const result = await request(
      'POST',
      '/nfts/mint',
      {
        clipId: 42,
        creatorWallet:
          'GC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3',
      },
      false,
    );
    expect(result.status).toBe(401);
  });
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
