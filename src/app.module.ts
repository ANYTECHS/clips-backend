import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { UserThrottlerGuard } from './common/guards/user-throttler.guard';
import { AuditLoggerService } from './common/audit/audit-logger.service';
import { APP_GUARD, APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { SecurityAuditFilter } from './common/filters/security-audit.filter';
import { HttpExceptionLoggingFilter } from './common/filters/http-exception-logging.filter';
import { RequestLoggingInterceptor } from './common/interceptors/request-logging.interceptor';
import { ThrottlerRedisModule } from './common/throttler/throttler-redis.module';
import { ThrottlerStorageRedisService } from './common/throttler/throttler-storage-redis.service';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { ClipsModule } from './clips/clips.module';
import { NftModule } from './nft/nft.module';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { VideosModule } from './videos/videos.module';
import { JobsModule } from './jobs/jobs.module';
import { PayoutsModule } from './payouts/payouts.module';
import { StellarModule } from './stellar/stellar.module';
import { CsrfModule } from './csrf/csrf.module';
import { EncryptionModule } from './encryption/encryption.module';
import { UserPlatformModule } from './user-platform/user-platform.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { CircuitBreakerModule } from './common/circuit-breaker/circuit-breaker.module';
import { RedisModule } from './redis/redis.module';
import { EarningsModule } from './earnings/earnings.module';
import { DailyEarningsModule } from './earnings/daily-earnings.module';
import { MetricsModule } from './metrics/metrics.module';
import { ConfigModule as AppConfigModule } from './config/config.module';
import { WalletsModule } from './wallets/wallets.module';
import { LoggerModule } from './logger/logger.module';
import { RequestIdMiddleware } from './logger/request-id.middleware';
import { UsersModule } from './users/users.module';
import { TransactionsModule } from './transactions/transactions.module';
import { HealthModule } from './health/health.module';
import { QueueDashboardModule } from './queue-dashboard/queue-dashboard.module';
import { ScheduleModule } from '@nestjs/schedule';
import { QueueModule } from './queue/queue.module';
import { GracefulShutdownModule } from './common/shutdown/graceful-shutdown.module';
import { CommonModule } from './common/common.module';
import { BlockchainModule } from './blockchain/blockchain.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),
    QueueModule,
    PrismaModule,
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule, ThrottlerRedisModule],
      inject: [ConfigService, ThrottlerStorageRedisService],
      useFactory: (
        config: ConfigService,
        storage: ThrottlerStorageRedisService,
      ) => {
        // Global tier: 100 requests per minute per tracker (IP or user ID).
        // Every tier is env-overridable so staging/load tests can raise
        // limits without code changes; production keeps the secure defaults.
        // Canonical: RATE_LIMIT_LIMIT (count) + RATE_LIMIT_TTL (seconds).
        // Legacy aliases THROTTLE_DEFAULT_LIMIT/THROTTLE_DEFAULT_TTL (ms) kept.
        const num = (key: string, fallback: number): number => {
          const raw = Number(config.get(key, fallback));
          return Number.isSafeInteger(raw) && raw > 0 ? raw : fallback;
        };
        const configuredTtlSeconds = config.get<string>('RATE_LIMIT_TTL');
        const defaultTtl =
          configuredTtlSeconds === undefined
            ? num('THROTTLE_DEFAULT_TTL', 60000)
            : Number(configuredTtlSeconds) * 1000;
        const defaultLimit = num(
          'RATE_LIMIT_LIMIT',
          num('THROTTLE_DEFAULT_LIMIT', 100),
        );
        if (
          !Number.isSafeInteger(defaultTtl) ||
          defaultTtl <= 0 ||
          !Number.isSafeInteger(defaultLimit) ||
          defaultLimit <= 0
        ) {
          throw new Error(
            'RATE_LIMIT_TTL and RATE_LIMIT_LIMIT must be positive integers',
          );
        }

        return {
          storage,
          throttlers: [
            {
              name: 'default',
              ttl: defaultTtl,
              limit: defaultLimit,
            },
            {
              name: 'auth',
              ttl: num('THROTTLE_AUTH_TTL', 60000),
              limit: num('THROTTLE_AUTH_LIMIT', 10),
            },
            // Stricter tier for high-value auth actions (login, signup, refresh,
            // password reset, OTP verification) per security hardening requirements.
            // 5 requests per minute per IP.
            {
              name: 'authStrict',
              ttl: num('THROTTLE_AUTH_STRICT_TTL', 60000),
              limit: num('THROTTLE_AUTH_STRICT_LIMIT', 5),
            },
            {
              name: 'sensitive',
              ttl: num('THROTTLE_SENSITIVE_TTL', 900000),
              limit: num('THROTTLE_SENSITIVE_LIMIT', 3),
            },
            {
              name: 'emailVerify',
              ttl: num('THROTTLE_EMAIL_VERIFY_TTL', 3600000),
              limit: num('THROTTLE_EMAIL_VERIFY_LIMIT', 3),
            },
            {
              name: 'clipGenerate',
              ttl: num('THROTTLE_CLIP_GENERATE_TTL', 60000),
              limit: num('THROTTLE_CLIP_GENERATE_LIMIT', 10),
            },
            {
              name: 'nftMint',
              ttl: num('THROTTLE_NFT_MINT_TTL', 60000),
              limit: num('THROTTLE_NFT_MINT_LIMIT', 5),
            },
            {
              name: 'walletConnect',
              ttl: num('THROTTLE_WALLET_CONNECT_TTL', 60000),
              limit: num('THROTTLE_WALLET_CONNECT_LIMIT', 10),
            },
            {
              name: 'walletDisconnect',
              ttl: num('THROTTLE_WALLET_DISCONNECT_TTL', 60000),
              limit: num('THROTTLE_WALLET_DISCONNECT_LIMIT', 10),
            },
            {
              name: 'transactionSend',
              ttl: num('THROTTLE_TRANSACTION_SEND_TTL', 60000),
              limit: num('THROTTLE_TRANSACTION_SEND_LIMIT', 5),
            },
          ],
          // Response headers (X-RateLimit-Limit/Remaining/Reset + Retry-After
          // on 429) are enabled by default in @nestjs/throttler v6.
          skipIf: (context) => {
            const request = context.switchToHttp().getRequest();
            const whitelist = config.get<string>('THROTTLER_WHITELIST');
            if (!whitelist) return false;
            const whitelistedIps = whitelist
              .split(',')
              .map((ip) => ip.trim().toLowerCase())
              .filter(Boolean);
            if (whitelistedIps.length === 0) return false;
            // Behind a reverse proxy, Express reports the proxy IP in
            // request.ip; the real client IP is the first entry of
            // X-Forwarded-For. Only trust that header when TRUST_PROXY=true.
            const candidates: string[] = [];
            if (
              config.get<string>('TRUST_PROXY') === 'true' &&
              typeof request.headers?.['x-forwarded-for'] === 'string'
            ) {
              const first = request.headers['x-forwarded-for']
                .split(',')[0]
                ?.trim()
                .toLowerCase();
              if (first) candidates.push(first);
            }
            if (typeof request.ip === 'string') {
              candidates.push(request.ip.toLowerCase());
            }
            return candidates.some((ip) => whitelistedIps.includes(ip));
          },
        };
      },
    }),
    LoggerModule,
    AuthModule,
    ClipsModule,
    VideosModule,
    JobsModule,
    StellarModule,
    CsrfModule,
    EncryptionModule,
    UserPlatformModule,
    SubscriptionsModule,
    NftModule,
    PayoutsModule,
    CircuitBreakerModule,
    RedisModule,
    EarningsModule,
    DailyEarningsModule,
    MetricsModule,
    AppConfigModule,
    WalletsModule,
    UsersModule,
    TransactionsModule,
    HealthModule,
    QueueDashboardModule,
    GracefulShutdownModule,
    CommonModule,
    BlockchainModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    AuditLoggerService,
    {
      provide: APP_GUARD,
      useClass: UserThrottlerGuard,
    },
    {
      provide: APP_FILTER,
      useClass: HttpExceptionLoggingFilter,
    },
    {
      provide: APP_FILTER,
      useClass: SecurityAuditFilter,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: RequestLoggingInterceptor,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
