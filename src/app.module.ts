import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { AppConfigModule } from './config/config.module';
import { AppConfigService } from './config/app-config.service';
import { ThrottlerModule, ThrottlerGuard, ThrottlerStorage } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerRedisModule } from './common/throttler/throttler-redis.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { ClipsModule } from './clips/clips.module';
import { NftModule } from './nft/nft.module';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { BullModule } from '@nestjs/bullmq';
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
import { WalletsModule } from './wallets/wallets.module';
import { LoggerModule } from './logger/logger.module';
import { RequestIdMiddleware } from './logger/request-id.middleware';
import { UsersModule } from './users/users.module';
import { TransactionsModule } from './transactions/transactions.module';
import { HealthModule } from './health/health.module';
import { QueueDashboardModule } from './queue-dashboard/queue-dashboard.module';
import { ScheduleModule } from '@nestjs/schedule';

@Module({
  imports: [
    AppConfigModule,
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),
    BullModule.forRootAsync({
      imports: [AppConfigModule],
      inject: [AppConfigService],
      useFactory: (appConfig: AppConfigService) => ({
        connection: {
          host: appConfig.redisHost,
          port: appConfig.redisPort,
          password: appConfig.redisPassword,
        },
      }),
    }),
    PrismaModule,
    ThrottlerModule.forRootAsync({
      imports: [AppConfigModule, ThrottlerRedisModule],
      inject: [AppConfigService, ThrottlerStorage],
      useFactory: (appConfig: AppConfigService, storage: ThrottlerStorage) => ({
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
          const whitelistedIps = appConfig.throttlerWhitelist;
          if (whitelistedIps.length === 0) return false;
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
    WalletsModule,
    UsersModule,
    TransactionsModule,
    HealthModule,
    QueueDashboardModule,
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
