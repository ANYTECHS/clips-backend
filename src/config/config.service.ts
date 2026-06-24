import { Injectable } from '@nestjs/common';

@Injectable()
export class ConfigService {
  readonly earningsCacheTtlSeconds = parseInt(process.env.EARNINGS_CACHE_TTL ?? '3600', 10);

  readonly leaderboardEnabled = process.env.LEADERBOARD_ENABLED === 'true';

  readonly creatorRoyaltyBps = parseInt(process.env.CREATOR_ROYALTY_BPS ?? '1000', 10);

  readonly platformRoyaltyBps = parseInt(process.env.PLATFORM_ROYALTY_BPS ?? '100', 10);

  readonly clipJobMaxAttempts = 5;

  readonly clipJobBackoffDelayMs = 2000;

  readonly nftMintJobMaxAttempts = 3;

  readonly nftMintJobBackoffDelayMs = 2000;

  readonly clipPostingJobMaxAttempts = 3;

  readonly clipPostingJobBackoffDelayMs = 2000;

  readonly emailDeliveryJobMaxAttempts = 3;

  readonly emailDeliveryJobBackoffDelayMs = 1000;

  readonly queueRateLimitWindowSeconds = 3600;

  readonly clipGenerationMaxConcurrentPerUser = 5;

  readonly adminEmails = (process.env.ADMIN_EMAILS ?? '').split(',').filter(Boolean);

  readonly sorobanNftContractId = process.env.SOROBAN_NFT_CONTRACT_ID || '';

  readonly platformWallet =
    process.env.PLATFORM_WALLET_ADDRESS ?? process.env.PLATFORM_WALLET ?? '';

  readonly ipfsProvider = process.env.IPFS_PROVIDER ?? '';

  readonly pinataJwt = process.env.PINATA_JWT ?? process.env.IPFS_JWT ?? '';

  readonly ipfsApiUrl = process.env.IPFS_API_URL ?? '';

  readonly nftStorageApiKey = process.env.NFT_STORAGE_API_KEY ?? '';

  readonly tiktokWebhookSecret = process.env.TIKTOK_WEBHOOK_SECRET || '';

  readonly youtubeWebhookSecret = process.env.YOUTUBE_WEBHOOK_SECRET || '';

  readonly redisHost = process.env.REDIS_HOST ?? 'localhost';

  readonly redisPort = parseInt(process.env.REDIS_PORT ?? '6379', 10);

  readonly redisPassword = process.env.REDIS_PASSWORD;
}
