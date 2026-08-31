import { Injectable } from '@nestjs/common';

@Injectable()
export class ConfigService {
  // ---------------------------------------------------------------------------
  // Server
  // ---------------------------------------------------------------------------

  /** HTTP port the NestJS application listens on. */
  readonly port = parseInt(process.env.PORT ?? '3000', 10);

  /** Current runtime environment ('development' | 'production' | 'test'). */
  readonly nodeEnv = process.env.NODE_ENV ?? 'development';

  // ---------------------------------------------------------------------------
  // Authentication & Encryption
  // ---------------------------------------------------------------------------

  /**
   * Secret used to encrypt sensitive data at rest (e.g. wallet private keys).
   * Must be at least 32 characters. Required in production.
   */
  readonly encryptionSecret = process.env.ENCRYPTION_SECRET ?? '';

  /** Secret used to sign and verify JWT access tokens. Required in production. */
  readonly jwtSecret = process.env.JWT_SECRET ?? '';

  /** JWT expiry duration string understood by the `jsonwebtoken` library (e.g. '7d'). */
  readonly jwtExpiresIn = process.env.JWT_EXPIRES_IN ?? '7d';

  // ---------------------------------------------------------------------------
  // Redis (BullMQ backing store & rate-limit cache)
  // ---------------------------------------------------------------------------

  /** Redis hostname. */
  readonly redisHost = process.env.REDIS_HOST ?? 'localhost';

  /** Redis port. */
  readonly redisPort = parseInt(process.env.REDIS_PORT ?? '6379', 10);

  /** Redis password (optional). */
  readonly redisPassword = process.env.REDIS_PASSWORD;

  // ---------------------------------------------------------------------------
  // BullMQ worker concurrency
  // ---------------------------------------------------------------------------

  /**
   * Number of clip-generation jobs that may run in parallel across all workers.
   * Tune this based on available FFmpeg / CPU resources.
   * See BULLMQ_WORKER_SCALING.md for guidance.
   */
  readonly bullmqClipGenerationConcurrency = parseInt(
    process.env.BULLMQ_CLIP_GENERATION_CONCURRENCY ?? '2',
    10,
  );

  /**
   * Number of email-delivery jobs that may run in parallel across all workers.
   */
  readonly bullmqEmailDeliveryConcurrency = parseInt(
    process.env.BULLMQ_EMAIL_DELIVERY_CONCURRENCY ?? '5',
    10,
  );

  // ---------------------------------------------------------------------------
  // BullMQ job retry / backoff settings
  // ---------------------------------------------------------------------------

  /** Maximum attempts for clip-generation jobs before the job is marked failed. */
  readonly clipJobMaxAttempts = 5;

  /** Initial exponential-backoff delay (ms) for clip-generation retries. */
  readonly clipJobBackoffDelayMs = 2000;

  /** Maximum attempts for NFT-mint jobs. */
  readonly nftMintJobMaxAttempts = 3;

  /** Initial backoff delay (ms) for NFT-mint retries. */
  readonly nftMintJobBackoffDelayMs = 2000;

  /** Maximum attempts for clip-posting jobs. */
  readonly clipPostingJobMaxAttempts = 3;

  /** Initial backoff delay (ms) for clip-posting retries. */
  readonly clipPostingJobBackoffDelayMs = 2000;

  /** Maximum attempts for email-delivery jobs. */
  readonly emailDeliveryJobMaxAttempts = 3;

  /** Initial backoff delay (ms) for email-delivery retries. */
  readonly emailDeliveryJobBackoffDelayMs = 1000;

  /** Rate-limit window for queue operations (seconds). */
  readonly queueRateLimitWindowSeconds = 3600;

  /** Maximum concurrent clip-generation jobs allowed per user at one time. */
  readonly clipGenerationMaxConcurrentPerUser = 5;

  // ---------------------------------------------------------------------------
  // Clip pagination
  // ---------------------------------------------------------------------------

  /** Maximum number of clips that can be returned in a single page. */
  readonly maxClipsPerPage = 100;

  /** Default number of clips returned per page when the client omits the param. */
  readonly defaultClipsPerPage = 20;

  // ---------------------------------------------------------------------------
  // Earnings & payouts
  // ---------------------------------------------------------------------------

  /** TTL (seconds) for cached earnings data. Env var: EARNINGS_CACHE_TTL. */
  readonly earningsCacheTtlSeconds = parseInt(process.env.EARNINGS_CACHE_TTL ?? '3600', 10);

  /**
   * Minimum Stellar payout amount in USD equivalent.
   * Requests below this threshold are rejected with 400 to prevent
   * fee-wasting micro-transactions. Env var: MIN_STELLAR_PAYOUT.
   * Validated at startup — must be a positive finite number.
   */
  readonly minStellarPayout: number;

  /**
   * Minimum platform payout in USD (general payout pipeline).
   * Env var: MIN_PAYOUT_USD.
   */
  readonly minPayoutUsd = parseFloat(process.env.MIN_PAYOUT_USD ?? '5');

  /**
   * Maximum platform payout in USD per request.
   * Env var: MAX_PAYOUT_USD.
   */
  readonly maxPayoutUsd = parseFloat(process.env.MAX_PAYOUT_USD ?? '10000');

  /** Whether the public earnings leaderboard is enabled. */
  readonly leaderboardEnabled = process.env.LEADERBOARD_ENABLED === 'true';

  // ---------------------------------------------------------------------------
  // Royalties (NFT)
  // ---------------------------------------------------------------------------

  /**
   * Creator royalty in basis points (bps). 1000 bps = 10%.
   * Env var: CREATOR_ROYALTY_BPS.
   */
  readonly creatorRoyaltyBps = parseInt(process.env.CREATOR_ROYALTY_BPS ?? '1000', 10);

  /**
   * Platform royalty in basis points (bps) taken on secondary NFT sales.
   * Env var: PLATFORM_ROYALTY_BPS.
   */
  readonly platformRoyaltyBps = parseInt(process.env.PLATFORM_ROYALTY_BPS ?? '100', 10);

  /**
   * Hard ceiling for royalty values accepted in DTOs / API requests.
   * Prevents accidental or malicious over-royalty configuration.
   */
  readonly maxRoyaltyBps = 1500;

  /**
   * Default royalty in bps applied when a creator does not specify one
   * (mirrors the DTO default for consistency).
   */
  readonly defaultRoyaltyBps = 1000;

  // ---------------------------------------------------------------------------
  // Stellar / Soroban
  // ---------------------------------------------------------------------------

  /** Deployed Soroban NFT contract ID. Env var: SOROBAN_NFT_CONTRACT_ID. */
  readonly sorobanNftContractId = process.env.SOROBAN_NFT_CONTRACT_ID || '';

  /**
   * Platform Stellar wallet address used as the royalty recipient.
   * Falls back to PLATFORM_WALLET if PLATFORM_WALLET_ADDRESS is not set.
   */
  readonly platformWallet =
    process.env.PLATFORM_WALLET_ADDRESS ?? process.env.PLATFORM_WALLET ?? '';

  /**
   * Stellar Asset Contract (SAC) address royalties are paid in.
   * Defaults to "native" (XLM) when unset; set to a SAC address (e.g. USDC) to
   * pay royalties in a custom asset. Must match a contract asset added via
   * the NFT contract's `add_supported_asset` admin call.
   */
  readonly royaltyAssetCode = process.env.ROYALTY_ASSET_CODE ?? 'native';

  /** Soroban contract ID of the royalty asset (empty for native XLM). */
  readonly royaltyAssetContractId = process.env.ROYALTY_ASSET_CONTRACT_ID ?? '';

  // ---------------------------------------------------------------------------
  // Wallet UI
  // ---------------------------------------------------------------------------

  /**
   * Minimum XLM balance (in lumens) below which the UI shows a balance warning.
   * Stellar requires a base reserve of 1 XLM; this threshold adds a safety buffer.
   */
  readonly walletMinXlmBalance = 2;

  /** Maximum number of wallet NFTs returned in a single page. */
  readonly maxWalletNftsPerPage = 100;

  // ---------------------------------------------------------------------------
  // IPFS / NFT metadata storage
  // ---------------------------------------------------------------------------

  /** IPFS provider identifier ('pinata' | 'nft.storage' | custom). */
  readonly ipfsProvider = process.env.IPFS_PROVIDER ?? '';

  /** Pinata JWT for uploading NFT metadata to IPFS. */
  readonly pinataJwt = process.env.PINATA_JWT ?? process.env.IPFS_JWT ?? '';

  /** Custom IPFS API base URL (used when ipfsProvider is not a managed service). */
  readonly ipfsApiUrl = process.env.IPFS_API_URL ?? '';

  /** NFT.Storage API key (alternative IPFS provider). */
  readonly nftStorageApiKey = process.env.NFT_STORAGE_API_KEY ?? '';

  // ---------------------------------------------------------------------------
  // Social / multi-platform posting
  // ---------------------------------------------------------------------------

  /**
   * Canonical list of social platforms supported for clip publishing.
   * Used by the posting pipeline and platform-validation logic.
   */
  readonly supportedPlatforms: ReadonlyArray<string> = [
    'tiktok',
    'instagram',
    'youtube',
    'facebook',
    'snapchat',
    'pinterest',
    'linkedin',
  ];

  /** HMAC-SHA256 webhook secret for incoming TikTok events. */
  readonly tiktokWebhookSecret = process.env.TIKTOK_WEBHOOK_SECRET || '';

  /** HMAC-SHA256 webhook secret for incoming YouTube events. */
  readonly youtubeWebhookSecret = process.env.YOUTUBE_WEBHOOK_SECRET || '';

  // ---------------------------------------------------------------------------
  // Admin
  // ---------------------------------------------------------------------------

  /**
   * Comma-separated list of admin email addresses.
   * Env var: ADMIN_EMAILS (e.g. "alice@example.com,bob@example.com").
   */
  readonly adminEmails = (process.env.ADMIN_EMAILS ?? '').split(',').filter(Boolean);

  // ---------------------------------------------------------------------------
  // Constructor — startup validation
  // ---------------------------------------------------------------------------

  constructor() {
    // Validate MIN_STELLAR_PAYOUT
    const rawStellarPayout = process.env.MIN_STELLAR_PAYOUT ?? '5';
    const parsedStellarPayout = parseFloat(rawStellarPayout);
    if (!isFinite(parsedStellarPayout) || parsedStellarPayout <= 0) {
      throw new Error(
        `Invalid MIN_STELLAR_PAYOUT: "${rawStellarPayout}" — must be a positive number`,
      );
    }
    this.minStellarPayout = parsedStellarPayout;

    // Validate numeric payout limits
    if (!isFinite(this.minPayoutUsd) || this.minPayoutUsd < 0) {
      throw new Error(`Invalid MIN_PAYOUT_USD: "${process.env.MIN_PAYOUT_USD}" — must be a non-negative number`);
    }
    if (!isFinite(this.maxPayoutUsd) || this.maxPayoutUsd <= 0) {
      throw new Error(`Invalid MAX_PAYOUT_USD: "${process.env.MAX_PAYOUT_USD}" — must be a positive number`);
    }
    if (this.minPayoutUsd > this.maxPayoutUsd) {
      throw new Error(
        `MIN_PAYOUT_USD (${this.minPayoutUsd}) must not exceed MAX_PAYOUT_USD (${this.maxPayoutUsd})`,
      );
    }

    // Validate royalty BPS values
    if (!Number.isInteger(this.creatorRoyaltyBps) || this.creatorRoyaltyBps < 0 || this.creatorRoyaltyBps > this.maxRoyaltyBps) {
      throw new Error(
        `Invalid CREATOR_ROYALTY_BPS: "${process.env.CREATOR_ROYALTY_BPS}" — must be an integer between 0 and ${this.maxRoyaltyBps}`,
      );
    }
    if (!Number.isInteger(this.platformRoyaltyBps) || this.platformRoyaltyBps < 0 || this.platformRoyaltyBps > this.maxRoyaltyBps) {
      throw new Error(
        `Invalid PLATFORM_ROYALTY_BPS: "${process.env.PLATFORM_ROYALTY_BPS}" — must be an integer between 0 and ${this.maxRoyaltyBps}`,
      );
    }

    // In production, secrets must be explicitly provided — empty defaults are not safe.
    if (this.nodeEnv === 'production') {
      if (!this.encryptionSecret) {
        throw new Error(
          'ENCRYPTION_SECRET is required in production. ' +
            'Set a random string of at least 32 characters.',
        );
      }
      if (!this.jwtSecret) {
        throw new Error(
          'JWT_SECRET is required in production. ' +
            'Set a strong random secret for signing access tokens.',
        );
      }
      if (!this.sorobanNftContractId) {
        throw new Error(
          'SOROBAN_NFT_CONTRACT_ID is required in production. ' +
            'Deploy the Soroban NFT contract and set its contract ID.',
        );
      }
    }
  }
}
