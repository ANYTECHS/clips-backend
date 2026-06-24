import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import {
  ThrottlerModule,
  ThrottlerGuard,
  ThrottlerStorage,
} from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerRedisModule } from './common/throttler/throttler-redis.module';
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

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),
    QueueModule,
    PrismaModule,
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule, ThrottlerRedisModule],
      inject: [ConfigService, ThrottlerStorage],
      useFactory: (config: ConfigService, storage: ThrottlerStorage) => ({
        storage,
        throttlers: [
          {
            name: 'default',
            ttl: 60000,
            limit: 100,
          },
          {
            name: 'auth',
            ttl: 60000,
            limit: 10,
          },
          {
            name: 'sensitive',
            ttl: 900000,
            limit: 3,
          },
          {
            name: 'emailVerify',
            ttl: 3600000,
            limit: 3,
          },
          {
            name: 'clipGenerate',
            ttl: 60000,
            limit: 10,
          },
          {
            name: 'nftMint',
            ttl: 60000,
            limit: 5,
          },
          {
            name: 'walletConnect',
            ttl: 60000,
            limit: 10,
          },
          {
            name: 'walletDisconnect',
            ttl: 60000,
            limit: 10,
          },
          {
            name: 'transactionSend',
            ttl: 60000,
            limit: 5,
          },
        ],
        skipIf: (context) => {
          const request = context.switchToHttp().getRequest();
          const whitelist = config.get<string>('THROTTLER_WHITELIST');
          if (!whitelist) return false;
          const whitelistedIps = whitelist.split(',').map((ip) => ip.trim());
          return whitelistedIps.includes(request.ip);
        },
      }),
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
    MetricsModule,
    AppConfigModule,
    WalletsModule,
    UsersModule,
    TransactionsModule,
    HealthModule,
    QueueDashboardModule,
    GracefulShutdownModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
