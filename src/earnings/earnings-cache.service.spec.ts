import { EarningsCacheService } from './earnings-cache.service';

describe('EarningsCacheService', () => {
  let service: EarningsCacheService;
  let redis: {
    get: jest.Mock;
    setex: jest.Mock;
    del: jest.Mock;
  };
  const config = { earningsCacheTtlSeconds: 1800 };

  beforeEach(() => {
    redis = {
      get: jest.fn().mockResolvedValue(null),
      setex: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(1),
    };
    service = new EarningsCacheService(redis as any, config as any);
  });

  it('returns null on cache miss', async () => {
    expect(await service.getSummary(1)).toBeNull();
    expect(await service.getTotal(1)).toBeNull();
  });

  it('returns cached summary on hit', async () => {
    const summary = {
      totalEarned: 100,
      totalPaidOut: 20,
      availableBalance: 80,
      currency: 'USD',
    };
    redis.get.mockResolvedValue(JSON.stringify(summary));
    expect(await service.getSummary(3)).toEqual(summary);
    expect(redis.get).toHaveBeenCalledWith('earnings:total:3');
  });

  it('writes summary with configured TTL', async () => {
    const summary = {
      totalEarned: 50,
      totalPaidOut: 0,
      availableBalance: 50,
      currency: 'USD',
    };
    await service.setSummary(2, summary);
    expect(redis.setex).toHaveBeenCalledWith(
      'earnings:total:2',
      1800,
      JSON.stringify(summary),
    );
  });

  it('writes and reads lightweight totals', async () => {
    const value = { total: 2500.5, currency: 'USD' };
    await service.setTotal(9, value);
    expect(redis.setex).toHaveBeenCalledWith(
      'earnings:user:9:total',
      1800,
      JSON.stringify(value),
    );

    redis.get.mockResolvedValue(JSON.stringify(value));
    expect(await service.getTotal(9)).toEqual(value);
  });

  it('invalidates both cache keys', async () => {
    await service.invalidate(4);
    expect(redis.del).toHaveBeenCalledWith(
      'earnings:total:4',
      'earnings:user:4:total',
    );
  });

  it('handles Redis failures gracefully', async () => {
    redis.get.mockRejectedValue(new Error('down'));
    redis.setex.mockRejectedValue(new Error('down'));
    redis.del.mockRejectedValue(new Error('down'));

    await expect(service.getSummary(1)).resolves.toBeNull();
    await expect(
      service.setSummary(1, {
        totalEarned: 1,
        totalPaidOut: 0,
        availableBalance: 1,
        currency: 'USD',
      }),
    ).resolves.toBeUndefined();
    await expect(service.invalidate(1)).resolves.toBeUndefined();
  });
});
