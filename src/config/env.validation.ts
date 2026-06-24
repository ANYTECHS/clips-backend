import { plainToInstance, Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  validateSync,
} from 'class-validator';

const DEV_JWT_SECRET = 'dev_jwt_secret';

export class EnvironmentVariables {
  @IsOptional()
  @IsString()
  NODE_ENV?: string;

  @IsOptional()
  @Transform(({ value }) => (value !== undefined ? Number(value) : undefined))
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT?: number;

  @IsOptional()
  @IsString()
  LOG_LEVEL?: string;

  @IsOptional()
  @IsString()
  DATABASE_URL?: string;

  @IsOptional()
  @IsString()
  ENCRYPTION_SECRET?: string;

  @IsOptional()
  @IsString()
  JWT_SECRET?: string;

  @IsOptional()
  @Transform(({ value }) => (value !== undefined ? Number(value) : undefined))
  @IsInt()
  @Min(1)
  JWT_EXPIRES?: number;

  @IsOptional()
  @Transform(({ value }) => (value !== undefined ? Number(value) : undefined))
  @IsInt()
  @Min(1)
  JWT_REFRESH_EXPIRES_DAYS?: number;

  @IsOptional()
  @IsString()
  GOOGLE_CLIENT_ID?: string;

  @IsOptional()
  @IsString()
  GOOGLE_CLIENT_SECRET?: string;

  @IsOptional()
  @IsString()
  GOOGLE_CALLBACK_URL?: string;

  @IsOptional()
  @IsString()
  APP_BASE_URL?: string;

  @IsOptional()
  @IsString()
  SMTP_HOST?: string;

  @IsOptional()
  @Transform(({ value }) => (value !== undefined ? Number(value) : undefined))
  @IsInt()
  SMTP_PORT?: number;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  SMTP_SECURE?: boolean;

  @IsOptional()
  @IsString()
  SMTP_USER?: string;

  @IsOptional()
  @IsString()
  SMTP_PASS?: string;

  @IsOptional()
  @IsString()
  SMTP_FROM?: string;

  @IsOptional()
  @IsString()
  ALLOWED_ORIGINS?: string;

  @IsOptional()
  @IsString()
  REDIS_HOST?: string;

  @IsOptional()
  @Transform(({ value }) => (value !== undefined ? Number(value) : undefined))
  @IsInt()
  @Min(1)
  @Max(65535)
  REDIS_PORT?: number;

  @IsOptional()
  @IsString()
  REDIS_PASSWORD?: string;

  @IsOptional()
  @Transform(({ value }) => (value !== undefined ? Number(value) : undefined))
  @IsInt()
  @Min(1)
  @Max(200)
  BULLMQ_CLIP_GENERATION_CONCURRENCY?: number;

  @IsOptional()
  @Transform(({ value }) => (value !== undefined ? Number(value) : undefined))
  @IsInt()
  @Min(1)
  @Max(50)
  BULLMQ_EMAIL_DELIVERY_CONCURRENCY?: number;

  @IsOptional()
  @Transform(({ value }) => (value !== undefined ? Number(value) : undefined))
  @IsInt()
  @Min(1)
  BRUTE_FORCE_MAX_ATTEMPTS?: number;

  @IsOptional()
  @Transform(({ value }) => (value !== undefined ? Number(value) : undefined))
  @IsInt()
  @Min(1)
  BRUTE_FORCE_LOCKOUT_DURATION?: number;

  @IsOptional()
  @Transform(({ value }) => (value !== undefined ? Number(value) : undefined))
  @IsInt()
  @Min(1)
  BRUTE_FORCE_WINDOW_DURATION?: number;

  @IsOptional()
  @IsString()
  THROTTLER_WHITELIST?: string;

  @IsOptional()
  @Transform(({ value }) => value !== 'false')
  @IsBoolean()
  COOKIE_SECURE?: boolean;

  @IsOptional()
  @IsIn(['strict', 'lax', 'none'])
  COOKIE_SAME_SITE?: 'strict' | 'lax' | 'none';

  @IsOptional()
  @IsString()
  STELLAR_NETWORK?: string;

  @IsOptional()
  @Transform(({ value }) => (value !== undefined ? Number(value) : undefined))
  @IsInt()
  @Min(0)
  PLATFORM_ROYALTY_BPS?: number;

  @IsOptional()
  @Transform(({ value }) => (value !== undefined ? Number(value) : undefined))
  @IsInt()
  @Min(0)
  CREATOR_ROYALTY_BPS?: number;

  @IsOptional()
  @IsString()
  PLATFORM_WALLET?: string;

  @IsOptional()
  @IsString()
  PLATFORM_WALLET_ADDRESS?: string;

  @IsOptional()
  @IsString()
  SOROBAN_NFT_CONTRACT_ID?: string;

  @IsOptional()
  @IsString()
  PINATA_JWT?: string;

  @IsOptional()
  @IsString()
  IPFS_JWT?: string;

  @IsOptional()
  @IsString()
  IPFS_API_URL?: string;

  @IsOptional()
  @IsString()
  CLOUDINARY_CLOUD_NAME?: string;

  @IsOptional()
  @IsString()
  CLOUDINARY_API_KEY?: string;

  @IsOptional()
  @IsString()
  CLOUDINARY_API_SECRET?: string;

  @IsOptional()
  @IsString()
  AYRSHARE_API_KEY?: string;

  @IsOptional()
  @IsString()
  METRICS_TOKEN?: string;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  LEADERBOARD_ENABLED?: boolean;

  @IsOptional()
  @IsString()
  WEBHOOK_SECRET?: string;

  @IsOptional()
  @IsString()
  TIKTOK_WEBHOOK_SECRET?: string;

  @IsOptional()
  @IsString()
  YOUTUBE_WEBHOOK_SECRET?: string;

  @IsOptional()
  @IsString()
  ADMIN_EMAILS?: string;

  @IsOptional()
  @IsString()
  ADMIN_SECRET?: string;

  @IsOptional()
  @Transform(({ value }) => (value !== undefined ? Number(value) : undefined))
  @IsNumber()
  ANOMALY_THRESHOLD_MULTIPLIER?: number;

  @IsOptional()
  @Transform(({ value }) => (value !== undefined ? Number(value) : undefined))
  @IsNumber()
  MIN_EARNINGS_FOR_ANALYSIS?: number;

  @IsOptional()
  @Transform(({ value }) => (value !== undefined ? Number(value) : undefined))
  @IsInt()
  @Min(1)
  ANOMALY_LOOKBACK_DAYS?: number;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  ENABLE_SWAGGER_UI?: boolean;

  @IsOptional()
  @Transform(({ value }) => (value !== undefined ? Number(value) : undefined))
  @IsInt()
  @Min(1000)
  GRACEFUL_SHUTDOWN_TIMEOUT_MS?: number;

  @IsOptional()
  @Transform(({ value }) => (value !== undefined ? Number(value) : undefined))
  @IsInt()
  @Min(1000)
  PAYOUT_VERIFIER_INTERVAL_MS?: number;

  @IsOptional()
  @Transform(({ value }) => (value !== undefined ? Number(value) : undefined))
  @IsInt()
  @Min(1)
  EARNINGS_CACHE_TTL?: number;

  @IsOptional()
  @Transform(({ value }) => (value !== undefined ? Number(value) : undefined))
  @IsInt()
  @Min(1)
  BULL_JOB_RETENTION_DAYS?: number;

  @IsOptional()
  @IsString()
  ANTHROPIC_API_KEY?: string;

  @IsOptional()
  @IsString()
  ANTHROPIC_MODEL?: string;
}

function formatValidationErrors(errors: ReturnType<typeof validateSync>): string[] {
  return errors.flatMap((error) =>
    error.constraints ? Object.values(error.constraints) : [],
  );
}

function collectProductionRequirements(config: Record<string, unknown>): string[] {
  const isProduction = config.NODE_ENV === 'production';
  if (!isProduction) {
    return [];
  }

  const errors: string[] = [];

  if (!config.DATABASE_URL) {
    errors.push('DATABASE_URL is required in production');
  }
  if (!config.ENCRYPTION_SECRET) {
    errors.push('ENCRYPTION_SECRET is required in production');
  }
  if (!config.JWT_SECRET || config.JWT_SECRET === DEV_JWT_SECRET) {
    errors.push('JWT_SECRET must be set to a secure value in production');
  }
  if (!config.SOROBAN_NFT_CONTRACT_ID) {
    errors.push('SOROBAN_NFT_CONTRACT_ID is required in production');
  }

  return errors;
}

/**
 * Validates environment variables at startup via ConfigModule.forRoot().
 * Throws with a descriptive message when configuration is invalid.
 */
export function validateEnv(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const schemaErrors = formatValidationErrors(
    validateSync(validatedConfig, { skipMissingProperties: true }),
  );
  const productionErrors = collectProductionRequirements(config);
  const errors = [...schemaErrors, ...productionErrors];

  if (errors.length > 0) {
    throw new Error(
      `Environment validation failed:\n${errors.map((e) => `  - ${e}`).join('\n')}`,
    );
  }

  return config;
}

/** Parse comma-separated env values into a trimmed string array. */
export function parseCsvEnv(value: string | undefined): string[] {
  if (!value) {
    return [];
  }
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

/** Shared helper for static decorators that run before DI is available. */
export function getAllowedOrigins(): string[] {
  const origins = parseCsvEnv(process.env.ALLOWED_ORIGINS);
  return origins.length > 0 ? origins : ['http://localhost:3000'];
}
