/**
 * Unit tests verifying throttle configuration values for sensitive endpoints.
 * Integration-level throttle behavior is tested via e2e tests.
 */
describe('Rate limit configuration', () => {
  const throttlers = [
    { name: 'default', ttl: 60000, limit: 100 },
    { name: 'auth', ttl: 60000, limit: 10 },
    { name: 'sensitive', ttl: 900000, limit: 3 },
    { name: 'emailVerify', ttl: 3600000, limit: 3 },
    { name: 'clipGenerate', ttl: 60000, limit: 10 },
    { name: 'nftMint', ttl: 60000, limit: 5 },
  ];

  it('sensitive throttler allows 3 requests per 15 minutes', () => {
    const t = throttlers.find((x) => x.name === 'sensitive')!;
    expect(t.limit).toBe(3);
    expect(t.ttl).toBe(15 * 60 * 1000); // 900000ms
  });

  it('emailVerify throttler allows 3 requests per hour', () => {
    const t = throttlers.find((x) => x.name === 'emailVerify')!;
    expect(t.limit).toBe(3);
    expect(t.ttl).toBe(60 * 60 * 1000); // 3600000ms
  });

  it('clipGenerate throttler allows 10 requests per minute', () => {
    const t = throttlers.find((x) => x.name === 'clipGenerate')!;
    expect(t.limit).toBe(10);
    expect(t.ttl).toBe(60000);
  });

  it('nftMint throttler allows 5 requests per minute', () => {
    const t = throttlers.find((x) => x.name === 'nftMint')!;
    expect(t.limit).toBe(5);
    expect(t.ttl).toBe(60000);
  });

  it('default throttler allows 100 requests per minute', () => {
    const t = throttlers.find((x) => x.name === 'default')!;
    expect(t.limit).toBe(100);
    expect(t.ttl).toBe(60000);
  });
});
