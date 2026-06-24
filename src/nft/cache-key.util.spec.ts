import { CacheKeyBuilder, CACHE_PREFIXES } from './cache-key.util';

describe('CacheKeyBuilder', () => {
  it('royalty key follows clipcash:{service}:v1:{identifier}', () => {
    expect(CacheKeyBuilder.royalty('GABCD')).toBe('clipcash:royalty:v1:GABCD');
  });

  it('batchRoyalty key follows clipcash:{service}:v1:{ids}', () => {
    expect(CacheKeyBuilder.batchRoyalty(['1', '2', '3'])).toBe(
      'clipcash:batch-royalty:v1:1,2,3',
    );
  });

  it('platformRevenue key follows clipcash:{service}:v1:total', () => {
    expect(CacheKeyBuilder.platformRevenue()).toBe(
      'clipcash:platform-revenue:v1:total',
    );
  });

  it('all keys start with clipcash:', () => {
    expect(CacheKeyBuilder.royalty('X')).toMatch(/^clipcash:/);
    expect(CacheKeyBuilder.batchRoyalty(['1'])).toMatch(/^clipcash:/);
    expect(CacheKeyBuilder.platformRevenue()).toMatch(/^clipcash:/);
  });

  it('CACHE_PREFIXES constants are used consistently', () => {
    expect(CacheKeyBuilder.royalty('ADDR')).toMatch(new RegExp(`^${CACHE_PREFIXES.ROYALTY}:`));
    expect(CacheKeyBuilder.batchRoyalty(['1'])).toMatch(new RegExp(`^${CACHE_PREFIXES.BATCH_ROYALTY}:`));
    expect(CacheKeyBuilder.platformRevenue()).toMatch(new RegExp(`^${CACHE_PREFIXES.PLATFORM_REVENUE}`));
  });
});
