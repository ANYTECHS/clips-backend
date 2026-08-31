# Testing Strategy

This document defines the full testing strategy for the ClipCash backend.  It
covers the testing pyramid, tooling, what to test at each layer, coverage goals,
and CI requirements.

---

## Table of Contents

1. [Testing Philosophy](#testing-philosophy)
2. [Test Pyramid](#test-pyramid)
3. [Unit Testing](#1-unit-testing)
4. [Integration Testing](#2-integration-testing)
5. [End-to-End (E2E) Testing](#3-end-to-end-e2e-testing)
6. [API Testing](#4-api-testing)
7. [Soroban Contract Testing](#5-soroban-contract-testing)
8. [Coverage Goals](#coverage-goals)
9. [CI Testing Requirements](#ci-testing-requirements)
10. [Swagger / OpenAPI Contract Validation](#swagger--openapi-contract-validation)
11. [Test Helpers and Fixtures](#test-helpers-and-fixtures)

---

## Testing Philosophy

- **Test behaviour, not implementation.** Tests should survive refactors that
  do not change observable behaviour.
- **Fast feedback first.** Unit tests are run on every commit; slow integration
  and E2E tests run on every PR and main branch push.
- **Isolation by default.** Unit tests mock all I/O (DB, Redis, HTTP). Only
  integration tests talk to real infrastructure.
- **One assertion per concept.** A failing test should pinpoint exactly what
  broke.
- **No flaky tests in CI.** Intermittent failures are treated as bugs and fixed
  before merging.

---

## Test Pyramid

```
         ╔═══════════════════╗
         ║  E2E / Contract   ║  ← slow, few, high-confidence
         ║  (real services)  ║
         ╠═══════════════════╣
         ║  Integration      ║  ← medium speed, covers service wiring
         ║  (mock DB / Redis)║
         ╠═══════════════════╣
         ║  Unit Tests       ║  ← fast, many, isolated
         ║  (all mocked)     ║
         ╚═══════════════════╝
```

| Layer        | Framework  | Location                     | Speed  |
|--------------|------------|------------------------------|--------|
| Unit         | Jest       | `src/**/*.spec.ts`           | < 5 ms |
| Integration  | Jest       | `test/*.integration-spec.ts` | < 1 s  |
| E2E          | Jest + Supertest | `test/*.e2e-spec.ts`   | 2–10 s |
| Contract     | Jest       | `test/*.api-spec.ts`         | < 1 s  |
| Soroban      | Jest (sandbox) | `test/*.contract-spec.ts`| 10–60 s|

---

## 1. Unit Testing

### What to test
- Service methods in isolation (all dependencies mocked).
- Utility functions and helpers (`virality-score.util`, `ffmpeg.util`, etc.).
- DTO validation rules — verify that invalid payloads produce the expected error messages.
- Guard and decorator logic.
- State machines, strategy patterns, and finite automata.

### Framework and configuration

```json
// package.json → jest config
{
  "jest": {
    "rootDir": "src",
    "testRegex": ".*\\.spec\\.ts$",
    "transform": { "^.+\\.(t|j)s$": "ts-jest" },
    "moduleFileExtensions": ["js","json","ts"],
    "collectCoverageFrom": ["**/*.(t|j)s"],
    "coverageDirectory": "../coverage",
    "testEnvironment": "node",
    "setupFilesAfterFramework": ["<rootDir>/test-setup.ts"]
  }
}
```

Run unit tests:
```bash
npm test
# With coverage:
npm test -- --coverage
```

### Conventions

- **File naming:** `<name>.spec.ts` co-located with the source file.
- **Module setup:** use `Test.createTestingModule({ providers: [...] })` with
  mock providers for every external dependency.
- **Mocking:** prefer `jest.fn()` over class mocks; reset with `jest.clearAllMocks()` in `beforeEach`.
- **Async tests:** always `await` promises; use `resolves`/`rejects` matchers.

### Example: service unit test

```typescript
// earnings.service.spec.ts
describe('EarningsService', () => {
  let service: EarningsService;
  let prisma: jest.Mocked<PrismaService>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        EarningsService,
        { provide: PrismaService, useValue: { earning: { aggregate: jest.fn() } } },
        { provide: RedisService, useValue: { get: jest.fn(), setex: jest.fn() } },
        { provide: ConfigService, useValue: { earningsCacheTtlSeconds: 3600 } },
      ],
    }).compile();
    service = module.get(EarningsService);
    prisma = module.get(PrismaService);
  });

  it('returns cached value on cache hit', async () => {
    // ...
  });
});
```

### DTO validation tests

DTO tests live in `test/dto-validation.spec.ts`.  They use `class-validator`
directly (no HTTP layer needed):

```typescript
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';

async function validateDto<T>(cls: new () => T, plain: Record<string, unknown>) {
  const instance = plainToInstance(cls, plain);
  const errors = await validate(instance as object);
  return errors.flatMap((e) => Object.values(e.constraints ?? {}));
}

it('fails when email is invalid', async () => {
  const errs = await validateDto(LoginDto, { email: 'not-an-email', password: 'pass1234' });
  expect(errs.some((e) => /valid email/i.test(e))).toBe(true);
});
```

---

## 2. Integration Testing

### What to test
- Multiple services wired together with mock external infrastructure (DB, Redis,
  Stellar SDK, Cloudinary).
- Repository layer — verifies Prisma queries produce the expected results against
  the real query builder (tested against an in-memory SQLite or Postgres test DB).
- BullMQ job enqueue / processor execution wiring.
- Event emitter chains (`EventEmitter2`).

### Location

`test/*.integration-spec.ts` — run via the shared `jest-e2e.json` configuration:

```bash
npm run test:e2e
```

> **Note:** Integration specs that need a database require `DATABASE_URL` to point
> to a dedicated test database.  Use `docker compose up -d` to start one locally.

### Framework and configuration

```json
// test/jest-e2e.json
{
  "moduleFileExtensions": ["js","json","ts"],
  "rootDir": "../",
  "testRegex": ".integration-spec\\.ts$",
  "transform": { "^.+\\.(t|j)s$": "ts-jest" },
  "testEnvironment": "node"
}
```

### Example: earnings integration test

```typescript
// test/earnings.integration-spec.ts
describe('EarningsAggregationService (integration)', () => {
  it('calculates total earnings across multiple clips', async () => {
    const module = await Test.createTestingModule({
      providers: [
        EarningsAggregationService,
        CurrencyConversionService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
        { provide: ConfigService, useValue: { earningsCacheTtlSeconds: 3600 } },
      ],
    }).compile();

    const service = module.get(EarningsAggregationService);
    const result = await service.getUserTotalEarnings(1, Currency.USD);
    expect(result.total).toBe(60);
  });
});
```

### BullMQ processor integration

Processor tests spin up a real `TestingModule` with a mock `Job` object:

```typescript
it('processes clip generation job', async () => {
  const job = { id: '1', data: { videoId: 'v1', ... }, updateProgress: jest.fn() } as any;
  await processor.process(job);
  expect(mockClipsService.updateClipStatus).toHaveBeenCalledWith('v1', 'ready');
});
```

---

## 3. End-to-End (E2E) Testing

### What to test
- Full HTTP request → service → database → HTTP response cycles.
- Authentication flows (signup, login, token refresh, MFA).
- Wallet connection and disconnection flows.
- Subscription activation via Stellar webhook.
- Rate limiting behaviour (429 responses).
- Error response shapes (validation errors, 401, 403, 404, 500).

### Location

`test/*.e2e-spec.ts`

### Framework

**Supertest** drives requests against a real NestJS application instance.  The
database is a dedicated test schema that is migrated and seeded before the suite
and torn down after.

```typescript
// app.e2e-spec.ts
describe('AppController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    await app.init();
  });

  afterAll(() => app.close());

  it('GET /health → 200', () => {
    return request(app.getHttpServer()).get('/health').expect(200);
  });
});
```

### Test database setup

```bash
# Start test containers
docker compose -f docker-compose.test.yml up -d

# Run migrations against test DB
DATABASE_URL="postgresql://postgres:password@localhost:5432/clipscash_test" \
  npx prisma migrate deploy

# Run E2E suite
npm run test:e2e
```

### Validation error shape test

```typescript
it('POST /auth/signup with invalid body → 400 with details array', async () => {
  const res = await request(app.getHttpServer())
    .post('/auth/signup')
    .send({ name: 'J', email: 'not-an-email', password: 'weak' })
    .expect(400);

  expect(res.body.message).toBe('Validation failed');
  expect(res.body.error).toBe('Bad Request');
  expect(Array.isArray(res.body.details)).toBe(true);
  expect(res.body.details.some((d: any) => d.field === 'email')).toBe(true);
});
```

---

## 4. API Testing

### What to test
- That controller handlers map to correct routes and HTTP methods.
- That Swagger/OpenAPI decorator metadata matches the handler signature.
- That response DTOs match the documented response schema.
- That `@Auth()` guards are applied to authenticated routes.

### Location

`test/*.api-spec.ts`

### Swagger / OpenAPI contract testing

The OpenAPI document is generated at startup and exported to `openapi.json`.
API contract tests load this JSON and assert specific paths and schemas:

```typescript
// test/contract.api-spec.ts
import openapi from '../openapi.json';

it('POST /auth/signup is documented', () => {
  expect(openapi.paths['/auth/signup']).toBeDefined();
  expect(openapi.paths['/auth/signup'].post).toBeDefined();
});

it('POST /auth/signup documents 400 Bad Request', () => {
  const responses = openapi.paths['/auth/signup'].post.responses;
  expect(responses['400']).toBeDefined();
});
```

### Validating controllers against API spec

For each controller handler, verify:
1. The route and method match the OpenAPI spec.
2. The `@ApiResponse` status codes are consistent with what the handler can
   actually return.
3. Response DTOs have `@ApiProperty` on every field.

Run with:
```bash
npx jest --testPathPattern="api-spec"
```

### Example: validating 400 response structure

```typescript
it('validation errors include "details" array', async () => {
  const res = await request(app.getHttpServer())
    .post('/earnings/export')
    .set('Authorization', `Bearer ${token}`)
    .query({ format: 'pdf' })
    .expect(400);

  expect(res.body).toMatchObject({
    statusCode: 400,
    message: expect.any(String),
    error: 'Bad Request',
  });
});
```

---

## 5. Soroban Contract Testing

### What to test
- That `NftMintService.prepareMintTx()` builds a valid XDR transaction.
- That royalty parameters are correctly encoded in the contract call.
- That the `soroban-indexer` correctly parses on-chain events.
- Contract invocation on Stellar Testnet (CI runs against testnet, not mainnet).

### Framework

Uses the `stellar-sdk` test utilities and a local Soroban sandbox (or testnet
when `STELLAR_NETWORK=testnet`):

```typescript
// test/soroban-bindings.integration-spec.ts
describe('SorobanBindings (integration)', () => {
  it('builds a valid mint XDR', async () => {
    const xdr = await nftMintService.prepareMintTx(clipId, walletAddress);
    expect(xdr).toMatch(/^[A-Za-z0-9+/]+=*$/); // base64-encoded XDR
  });
});
```

### Test configuration

```json
// test/jest-contract.json
{
  "testRegex": "\\.contract-spec\\.ts$",
  "testEnvironment": "node",
  "testTimeout": 60000
}
```

Run with:
```bash
npm run test:contract
# or for CI
STELLAR_NETWORK=testnet npm run test:contract
```

### Environment requirements

| Variable | Required for contract tests | Value |
|---|---|---|
| `STELLAR_NETWORK` | ✅ | `testnet` |
| `SOROBAN_NFT_CONTRACT_ID` | ✅ | Deployed testnet contract ID |
| `SOROBAN_RPC_URL` | ✅ | `https://soroban-testnet.stellar.org` |

---

## Coverage Goals

| Module           | Line Coverage | Branch Coverage |
|------------------|--------------|-----------------|
| `src/auth`       | ≥ 80%        | ≥ 70%           |
| `src/clips`      | ≥ 80%        | ≥ 70%           |
| `src/earnings`   | ≥ 85%        | ≥ 75%           |
| `src/payouts`    | ≥ 85%        | ≥ 75%           |
| `src/nft`        | ≥ 75%        | ≥ 65%           |
| `src/wallets`    | ≥ 80%        | ≥ 70%           |
| `src/stellar`    | ≥ 75%        | ≥ 65%           |
| **Overall**      | **≥ 80%**    | **≥ 70%**       |

Check coverage:
```bash
npm test -- --coverage --coverageReporters=text-summary
```

Enforce in CI with `--coverageThreshold`:
```json
// jest.config.js
coverageThreshold: {
  global: {
    lines: 80,
    branches: 70,
  }
}
```

---

## CI Testing Requirements

The GitHub Actions workflow (`.github/workflows/ci.yml`) runs the following
stages on every push and PR:

### Stage 1: Lint and type-check (always runs)
```yaml
- run: npm run lint
- run: npx tsc --noEmit
```

### Stage 2: Unit tests
```yaml
- run: npm test -- --coverage --ci
- uses: actions/upload-artifact@v4
  with:
    name: coverage-report
    path: coverage/
```

### Stage 3: Integration and E2E tests
```yaml
services:
  postgres:
    image: postgres:14
    env: { POSTGRES_PASSWORD: password }
  redis:
    image: redis:7
- run: npm run test:e2e
```

### Stage 4: Build verification
```yaml
- run: npm run build
```

### Stage 5: Contract tests (only on `main` and release PRs)
```yaml
- run: npm run test:contract
  env:
    STELLAR_NETWORK: testnet
    SOROBAN_NFT_CONTRACT_ID: ${{ secrets.TESTNET_CONTRACT_ID }}
```

### Failing CI gates
A PR cannot be merged if any of these fail:
- Any unit test fails.
- Global line coverage drops below 80%.
- Any E2E test fails.
- TypeScript compilation fails.
- ESLint reports errors.

---

## Swagger / OpenAPI Contract Validation

### How the spec is generated

The OpenAPI JSON is auto-generated at server startup from `@ApiTags`,
`@ApiOperation`, `@ApiResponse`, and `@ApiProperty` decorators, then written
to `openapi.json`.  The spec is committed to the repo so diffs are visible in
PRs.

### Validating the spec in CI

```bash
# Regenerate and diff
npm run start:dev &
sleep 5
curl http://localhost:3000/api/docs-json > openapi.json
git diff --exit-code openapi.json
```

A changed `openapi.json` without a corresponding PR description update is a
signal that API contracts changed unintentionally.

### API contract tests

`test/contract.api-spec.ts` imports `openapi.json` directly and asserts:

```typescript
import spec from '../openapi.json';

it('every protected endpoint documents 401 Unauthorized', () => {
  for (const [path, methods] of Object.entries(spec.paths)) {
    for (const [method, op] of Object.entries(methods as any)) {
      if ((op as any).security?.length) {
        expect((op as any).responses?.['401']).toBeDefined();
      }
    }
  }
});
```

### Controller ↔ spec alignment checklist

For every new controller endpoint, verify:
- [ ] `@ApiOperation({ summary, description })` is present.
- [ ] `@ApiResponse` covers at least the happy-path status code.
- [ ] `@ApiBadRequestResponse` is present when the handler can throw `BadRequestException`.
- [ ] `@ApiUnauthorizedResponse` is present when `@Auth()` is applied.
- [ ] Response DTO has `@ApiProperty` on every field.
- [ ] Query params have `@ApiQuery` with `required`, `type`, `description`, and `example`.

---

## Test Helpers and Fixtures

### `test/helpers/`
- `ffmpeg-mock.helper.ts` — fluent-ffmpeg mock for clip-generation tests.

### `test/mocks/`
- `cloudinary.mock.ts` — Cloudinary SDK upload stub.
- `stellar-sdk.mock.ts` — Stellar SDK mock for wallet/transaction tests.

### `test/fixtures/`
- `video.fixture.ts` — creates Video DB records with default fields.
- `clip.fixture.ts` — creates Clip DB records linked to video fixtures.

### `src/__mocks__/`
- `cockatiel.ts` — circuit-breaker stub (prevents real network calls in unit tests).
- `cloudinary.ts` — Cloudinary auto-mock.

### `test/__mocks__/`
- `fluent-ffmpeg.ts` — complete fluent-ffmpeg module mock.
- `cockatiel.js` — CJS version of the circuit-breaker stub.

### Creating a new fixture

```typescript
// test/fixtures/earning.fixture.ts
import { PrismaService } from '../../src/prisma/prisma.service';

export async function createEarningFixture(
  prisma: PrismaService,
  clipId: number,
  amount = 50,
) {
  return prisma.earning.create({
    data: { clipId, amount, currency: 'USD', date: new Date(), source: 'royalty' },
  });
}
```
