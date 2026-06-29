# Testing Strategy

This document defines how testing is conducted across ClipCash to ensure correctness, reliability, and maintainability.

---

## Test Types

### 1. Unit Tests

**Purpose:** Verify individual functions and classes in isolation

**Scope:**
- Pure functions (no side effects)
- Single responsibility logic
- Error handling within a module

**Tools:**
- Jest (framework)
- Mocking: `jest.mock()` for dependencies

**Example:**

```typescript
describe('CurrencyConversionService', () => {
  let service: CurrencyConversionService;

  beforeEach(() => {
    service = new CurrencyConversionService();
  });

  it('should convert USD to EUR', () => {
    const result = service.convert(100, Currency.USD, Currency.EUR);
    expect(result).toBeGreaterThan(0);
  });

  it('should throw on invalid currency', () => {
    expect(() => {
      service.convert(100, 'INVALID' as any, Currency.USD);
    }).toThrow();
  });
});
```

**Coverage Goals:**
- Minimum 80% line coverage per file
- 100% coverage for critical paths (auth, payments, data validation)
- All error branches tested

**Run:**
```bash
npm run test                    # Run all unit tests
npm run test -- --coverage     # With coverage report
npm run test -- --watch        # Watch mode during development
```

**File location:** `src/**/*.spec.ts`

---

### 2. Integration Tests

**Purpose:** Verify multiple components work together with real dependencies (database, Redis, external services)

**Scope:**
- Service-to-service communication
- Database queries (Prisma)
- Redis cache operations
- API endpoints with full middleware chain
- Queue processing (BullMQ)

**Tools:**
- Jest
- Testcontainers (optional, for database/Redis containers)
- Real database instance or in-memory test DB (Prisma)

**Example:**

```typescript
describe('EarningsService Integration', () => {
  let service: EarningsService;
  let prisma: PrismaService;
  let redis: RedisService;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      providers: [EarningsService, PrismaService, RedisService],
    }).compile();
    
    service = module.get(EarningsService);
    prisma = module.get(PrismaService);
    redis = module.get(RedisService);
  });

  beforeEach(async () => {
    await prisma.earning.deleteMany({}); // Clean DB before each test
    await redis.flushdb();                 // Clear cache
  });

  it('should aggregate earnings from database and cache', async () => {
    const userId = 1;
    
    await prisma.earning.create({
      data: { userId, amount: 100, currency: 'USD', source: 'royalty' },
    });

    const result = await service.getUserTotalEarnings(userId);
    expect(result.total).toBe(100);
    expect(result.currency).toBe('USD');

    const cached = await redis.get(service.getCacheKey(userId, 'USD'));
    expect(cached).toBeDefined();
  });
});
```

**Coverage Goals:**
- Core workflows: 100%
- Happy path: 100%
- Alternate paths (retries, failures): 80%

**Run:**
```bash
npm run test:integration       # Run all integration tests
npm run test -- --testPathPattern=integration
```

**File location:** `test/**/*integration*.ts`

**Database Setup:**
- Use `.env.test` for test configuration
- Run `npx prisma migrate deploy --skip-generate` before tests
- Transactions or truncation between tests for isolation

---

### 3. End-to-End (E2E) Tests

**Purpose:** Verify complete user workflows from HTTP request to database and external effects

**Scope:**
- Full request-response cycle
- Authentication and authorization
- Error responses (4xx, 5xx)
- State changes (database, cache, queue)
- Webhook handling
- Rate limiting

**Tools:**
- Jest + Supertest (for HTTP testing)
- Real or test instance of the application

**Example:**

```typescript
describe('Clip Generation E2E', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = module.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should generate clip and emit WebSocket event', async () => {
    const userId = 1;
    const videoId = 'video-001';

    const response = await request(app.getHttpServer())
      .post('/clips/generate')
      .set('Authorization', `Bearer token-${userId}`)
      .send({
        videoId,
        startTime: 0,
        endTime: 5000,
      })
      .expect(201);

    expect(response.body).toHaveProperty('jobId');
    expect(response.body.status).toBe('queued');

    const clip = await prisma.clip.findFirst({ where: { videoId } });
    expect(clip).toBeDefined();
    expect(clip.status).toBe('generating');
  });

  it('should return 429 when rate limit exceeded', async () => {
    const userId = 2;

    for (let i = 0; i < 5; i++) {
      await request(app.getHttpServer())
        .post('/clips/generate')
        .set('Authorization', `Bearer token-${userId}`)
        .send({ videoId: `v-${i}`, startTime: 0, endTime: 1000 })
        .expect(201);
    }

    await request(app.getHttpServer())
      .post('/clips/generate')
      .set('Authorization', `Bearer token-${userId}`)
      .send({ videoId: 'v-5', startTime: 0, endTime: 1000 })
      .expect(429);
  });
});
```

**Coverage Goals:**
- Happy path: 100%
- Error paths (auth failures, validation, rate limits): 100%
- Alternate workflows: 90%

**Run:**
```bash
npm run test:e2e                # Run all E2E tests
npm run test:e2e -- --watch    # Watch mode
```

**Configuration:**
- `jest-e2e.json` in project root
- Separate `.env.test.e2e` for E2E database

**File location:** `test/**/*.e2e-spec.ts`

---

### 4. Contract Testing (Soroban)

**Purpose:** Verify Soroban smart contract logic for minting, royalties, and escrow

**Scope:**
- Contract function calls with valid inputs
- Invalid input rejection
- State mutations
- Cross-contract calls

**Tools:**
- Soroban SDK test utilities (`#[cfg(test)]`)
- Rust test framework

**Example:**

```rust
#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn test_mint_with_royalty() {
    let env = Env::default();
    let contract_id = env.register_contract(None, Contract);
    let client = ContractClient::new(&env, &contract_id);

    let creator = Address::generate(&env);
    let platform = Address::generate(&env);

    let tx = client.mint(
      &creator,
      &platform,
      &BytesN::random(&env), // token URI hash
      &1000,                 // creator royalty: 10%
      &100,                  // platform royalty: 1%
    );

    assert_eq!(tx.status, TxStatus::Ok);
    assert_eq!(client.get_balance(&creator), expected_amount);
  }
}
```

**Run:**
```bash
cd contracts/nft-royalty
cargo test --lib
cargo test --all --all-targets
```

**File location:** `contracts/**/*.rs` with `#[cfg(test)]` modules

**Coverage Goals:**
- All public functions: 100%
- All error paths: 100%
- State invariants: validated in tests

---

## Test Fixtures and Mocks

### Database Fixtures

Use Prisma seeding for test data:

```typescript
// test/fixtures/earnings.fixture.ts
export async function seedEarnings(prisma: PrismaService) {
  return await prisma.earning.createMany({
    data: [
      { userId: 1, amount: 100, currency: 'USD', source: 'royalty' },
      { userId: 1, amount: 50, currency: 'EUR', source: 'subscription' },
    ],
  });
}
```

Use in tests:

```typescript
beforeEach(async () => {
  await seedEarnings(prisma);
});
```

### Service Mocks

```typescript
const mockCurrencyConversionService = {
  convert: jest.fn().mockReturnValue(100),
};

const module = await Test.createTestingModule({
  providers: [
    EarningsService,
    {
      provide: CurrencyConversionService,
      useValue: mockCurrencyConversionService,
    },
  ],
}).compile();
```

### API Mock Responses

```typescript
// test/mocks/soroban.mock.ts
export const mockSorobanRpc = {
  getTransaction: jest.fn().mockResolvedValue({
    status: 'SUCCESS',
    result: { ... },
  }),
};
```

---

## Test Isolation

### Database Isolation

- Use transactions: `prisma.$transaction()`
- Wrap in `beforeEach`: Delete all records before each test
- Use test database separate from dev/prod

```typescript
beforeEach(async () => {
  await prisma.$transaction([
    prisma.earning.deleteMany({}),
    prisma.clip.deleteMany({}),
    prisma.user.deleteMany({}),
  ]);
});
```

### Queue Isolation

- Use test Redis instance or in-memory mock
- Clear Redis between tests:

```typescript
beforeEach(async () => {
  await redis.flushdb();
});
```

### Async Isolation

- Always `await` async operations
- Use Jest hooks: `beforeEach`, `beforeAll`, `afterEach`, `afterAll`
- Avoid time-dependent assertions (use fake timers if needed)

```typescript
jest.useFakeTimers();

it('should retry after 2 seconds', () => {
  service.retryAfter(2000);
  jest.advanceTimersByTime(2000);
  expect(service.isRetried()).toBe(true);
});
```

---

## Coverage Requirements

### Minimum Coverage

| Metric | Target |
|--------|--------|
| Line coverage | 80% |
| Branch coverage | 75% |
| Function coverage | 80% |
| Statement coverage | 80% |

### Coverage by Category

| Category | Target | Notes |
|----------|--------|-------|
| Authentication | 100% | Security-critical |
| Authorization | 100% | Security-critical |
| Data validation | 100% | Prevents invalid state |
| Error handling | 90% | All error paths |
| Business logic | 85% | Earnings, royalties, minting |
| API endpoints | 85% | Happy + error paths |
| Utilities | 80% | Helper functions |

### Exempt from Coverage

- Main application entrypoint (`main.ts`)
- Configuration loaders
- Generated code (Prisma, GraphQL)
- External library re-exports
- Mock implementations used only in tests

---

## Running Tests

### Commands

```bash
# All tests
npm test

# Unit tests only
npm run test -- --testPathPattern="\.spec\.ts$"

# Integration tests
npm run test:integration

# E2E tests
npm run test:e2e

# With coverage report
npm run test -- --coverage

# Watch mode
npm run test -- --watch

# Single file
npm run test -- earnings.spec.ts

# Match pattern
npm run test -- --testNamePattern="should aggregate earnings"
```

### CI/CD

Tests run in GitHub Actions on every push:

```yaml
- name: Run tests
  run: npm test -- --coverage

- name: Upload coverage
  uses: codecov/codecov-action@v3
```

---

## Best Practices

1. **Test behavior, not implementation**
   - Bad: `expect(mockService.convert).toHaveBeenCalled()`
   - Good: `expect(result.currency).toBe('USD')`

2. **Use descriptive test names**
   - Bad: `it('works')`
   - Good: `it('should convert earnings to target currency when conversion rate exists')`

3. **One assertion per test** (preferred)
   - Bad: Multiple unrelated assertions
   - Good: One logical operation and verify result

4. **Avoid test interdependencies**
   - Bad: Test A sets up data for Test B
   - Good: Each test is self-contained via `beforeEach`

5. **Use factory functions for test data**
   - Bad: Hardcoded test objects scattered in tests
   - Good: Centralized factory: `createTestEarning({ amount: 100 })`

6. **Fail tests intentionally during development**
   - Red -> Green -> Refactor (TDD)
   - Write test first, watch it fail, implement fix

---

## Troubleshooting

### Tests timing out

- Increase Jest timeout: `jest.setTimeout(10000)`
- Check for missing `await`
- Verify database/Redis connectivity

### Flaky tests

- Avoid `Date.now()` without mocking time
- Don't rely on timing (`setTimeout` assertions)
- Ensure proper cleanup in `afterEach`

### Database migrations not applied

```bash
npx prisma migrate deploy --skip-generate
npx prisma db seed
```

### Redis connection refused

```bash
# Start Redis
redis-server

# Or use Docker
docker run -d -p 6379:6379 redis:7-alpine
```

---

## Continuous Improvement

- Review coverage reports monthly
- Add tests for new bugs (regression prevention)
- Refactor flaky tests
- Measure test execution time and optimize slow ones
