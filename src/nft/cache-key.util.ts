const APP_PREFIX = 'clipcash';

export const CACHE_PREFIXES = {
  ROYALTY: `${APP_PREFIX}:royalty:v1`,
  BATCH_ROYALTY: `${APP_PREFIX}:batch-royalty:v1`,
  PLATFORM_REVENUE: `${APP_PREFIX}:platform-revenue:v1`,
} as const;

export const CacheKeyBuilder = {
  royalty: (mintAddress: string) =>
    `${CACHE_PREFIXES.ROYALTY}:${mintAddress}`,

  batchRoyalty: (tokenIds: string[]) =>
    `${CACHE_PREFIXES.BATCH_ROYALTY}:${tokenIds.join(',')}`,

  platformRevenue: () =>
    `${CACHE_PREFIXES.PLATFORM_REVENUE}:total`,
};
