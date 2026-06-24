import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getAllowedOrigins, parseCsvEnv } from './env.validation';

@Injectable()
export class AppConfigService {
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

  constructor(private readonly config: ConfigService) {}

  get nodeEnv(): string {
    return this.config.get<string>('NODE_ENV', 'development');
  }

  get isProduction(): boolean {
    return this.nodeEnv === 'production';
  }

  get port(): number {
    return this.config.get<number>('PORT', 3000);
  }

  get logLevel(): string {
    return (this.config.get<string>('LOG_LEVEL', 'info') ?? 'info').toLowerCase();
  }

  get databaseUrl(): string | undefined {
    return this.config.get<string>('DATABASE_URL');
  }

  get encryptionSecret(): string | undefined {
    return this.config.get<string>('ENCRYPTION_SECRET');
  }

  get jwtSecret(): string {
    return this.config.get<string>('JWT_SECRET', 'dev_jwt_secret');
  }

  get jwtExpires(): number {
    const value = this.config.get<number>('JWT_EXPIRES', 3600);
    return value > 0 ? value : 3600;
  }

  get jwtRefreshExpiresDays(): number {
    const value = this.config.get<number>('JWT_REFRESH_EXPIRES_DAYS', 14);
    return value > 0 ? value : 14;
  }

  get googleClientId(): string {
    return this.config.get<string>('GOOGLE_CLIENT_ID', 'google-client-id');
  }

  get googleClientSecret(): string {
    return this.config.get<string>('GOOGLE_CLIENT_SECRET', 'google-client-secret');
  }

  get googleCallbackUrl(): string {
    return this.config.get<string>(
      'GOOGLE_CALLBACK_URL',
      'http://localhost:3000/auth/google/callback',
    );
  }

  get appBaseUrl(): string {
    return this.config.get<string>('APP_BASE_URL', 'http://localhost:3000');
  }

  get smtpHost(): string {
    return this.config.get<string>('SMTP_HOST', 'smtp.ethereal.email');
  }

  get smtpPort(): number {
    return this.config.get<number>('SMTP_PORT', 587);
  }

  get smtpSecure(): boolean {
    return this.config.get<boolean>('SMTP_SECURE', false);
  }

  get smtpUser(): string | undefined {
    return this.config.get<string>('SMTP_USER');
  }

  get smtpPass(): string | undefined {
    return this.config.get<string>('SMTP_PASS');
  }

  get smtpFrom(): string {
    return this.config.get<string>('SMTP_FROM', '"Clips App" <noreply@clips.app>');
  }

  get allowedOrigins(): string[] {
    return getAllowedOrigins();
  }

  get redisHost(): string {
    return this.config.get<string>('REDIS_HOST', 'localhost');
  }

  get redisPort(): number {
    return this.config.get<number>('REDIS_PORT', 6379);
  }

  get redisPassword(): string | undefined {
    return this.config.get<string>('REDIS_PASSWORD') || undefined;
  }

  get bullmqClipGenerationConcurrency(): number {
    return this.config.get<number>('BULLMQ_CLIP_GENERATION_CONCURRENCY', 2);
  }

  get bullmqEmailDeliveryConcurrency(): number {
    return this.config.get<number>('BULLMQ_EMAIL_DELIVERY_CONCURRENCY', 5);
  }

  get bruteForceMaxAttempts(): number {
    return this.config.get<number>('BRUTE_FORCE_MAX_ATTEMPTS', 5);
  }

  get bruteForceLockoutDuration(): number {
    return this.config.get<number>('BRUTE_FORCE_LOCKOUT_DURATION', 900);
  }

  get bruteForceWindowDuration(): number {
    return this.config.get<number>('BRUTE_FORCE_WINDOW_DURATION', 900);
  }

  get throttlerWhitelist(): string[] {
    return parseCsvEnv(this.config.get<string>('THROTTLER_WHITELIST'));
  }

  get cookieSecure(): boolean {
    return this.config.get<boolean>('COOKIE_SECURE', true);
  }

  get cookieSameSite(): 'strict' | 'lax' | 'none' {
    const raw = (this.config.get<string>('COOKIE_SAME_SITE', 'lax') ?? 'lax').toLowerCase();
    return raw === 'strict' || raw === 'none' ? raw : 'lax';
  }

  get stellarNetwork(): string {
    return this.config.get<string>('STELLAR_NETWORK', 'testnet');
  }

  get creatorRoyaltyBps(): number {
    return this.config.get<number>('CREATOR_ROYALTY_BPS', 1000);
  }

  get platformRoyaltyBps(): number {
    return this.config.get<number>('PLATFORM_ROYALTY_BPS', 100);
  }

  get platformWallet(): string {
    return (
      this.config.get<string>('PLATFORM_WALLET') ||
      this.config.get<string>('PLATFORM_WALLET_ADDRESS') ||
      ''
    );
  }

  get sorobanNftContractId(): string {
    return this.config.get<string>('SOROBAN_NFT_CONTRACT_ID', '');
  }

  get pinataJwt(): string | undefined {
    return this.config.get<string>('PINATA_JWT') || this.config.get<string>('IPFS_JWT');
  }

  get ipfsApiUrl(): string {
    return (
      this.config.get<string>('IPFS_API_URL') ??
      'https://api.pinata.cloud/pinning/pinJSONToIPFS'
    );
  }

  get cloudinaryCloudName(): string | undefined {
    return this.config.get<string>('CLOUDINARY_CLOUD_NAME');
  }

  get cloudinaryApiKey(): string | undefined {
    return this.config.get<string>('CLOUDINARY_API_KEY');
  }

  get cloudinaryApiSecret(): string | undefined {
    return this.config.get<string>('CLOUDINARY_API_SECRET');
  }

  get ayrshareApiKey(): string {
    return this.config.get<string>('AYRSHARE_API_KEY', '');
  }

  get metricsToken(): string | undefined {
    return this.config.get<string>('METRICS_TOKEN');
  }

  get leaderboardEnabled(): boolean {
    return this.config.get<boolean>('LEADERBOARD_ENABLED', false);
  }

  get webhookSecret(): string | undefined {
    return this.config.get<string>('WEBHOOK_SECRET');
  }

  get tiktokWebhookSecret(): string | undefined {
    return this.config.get<string>('TIKTOK_WEBHOOK_SECRET');
  }

  get youtubeWebhookSecret(): string | undefined {
    return this.config.get<string>('YOUTUBE_WEBHOOK_SECRET');
  }

  get adminEmails(): string[] {
    return parseCsvEnv(this.config.get<string>('ADMIN_EMAILS'));
  }

  get adminSecret(): string | undefined {
    return this.config.get<string>('ADMIN_SECRET');
  }

  get anomalyThresholdMultiplier(): number {
    return this.config.get<number>('ANOMALY_THRESHOLD_MULTIPLIER', 3);
  }

  get minEarningsForAnalysis(): number {
    return this.config.get<number>('MIN_EARNINGS_FOR_ANALYSIS', 10);
  }

  get anomalyLookbackDays(): number {
    return this.config.get<number>('ANOMALY_LOOKBACK_DAYS', 30);
  }

  get enableSwaggerUi(): boolean {
    return this.config.get<boolean>('ENABLE_SWAGGER_UI', false);
  }

  get gracefulShutdownTimeoutMs(): number {
    return this.config.get<number>('GRACEFUL_SHUTDOWN_TIMEOUT_MS', 30000);
  }

  get payoutVerifierIntervalMs(): number {
    return this.config.get<number>('PAYOUT_VERIFIER_INTERVAL_MS', 60000);
  }

  get earningsCacheTtlSeconds(): number {
    return this.config.get<number>('EARNINGS_CACHE_TTL', 3600);
  }

  get bullJobRetentionDays(): number {
    return this.config.get<number>('BULL_JOB_RETENTION_DAYS', 30);
  }

  get anthropicApiKey(): string | undefined {
    return this.config.get<string>('ANTHROPIC_API_KEY');
  }

  get anthropicModel(): string {
    return this.config.get<string>('ANTHROPIC_MODEL', 'claude-4.1');
  }
}
