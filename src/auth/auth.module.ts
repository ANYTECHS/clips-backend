import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { GoogleStrategy } from './strategies/google.strategy';
import { JwtStrategy } from './strategies/jwt.strategy';
import { IsStrongPasswordConstraint } from './validators/is-strong-password.validator';
import { MailService } from './mail.service';
import { CookieService } from './cookie.service';
import { DeviceFingerprintService } from './device-fingerprint.service';
import { BruteForceProtectionService } from './brute-force-protection.service';
import { PrismaModule } from '../prisma/prisma.module';
import { CsrfModule } from '../csrf/csrf.module';
import { BullModule } from '@nestjs/bullmq';
import {
  EMAIL_DELIVERY_QUEUE,
  EMAIL_DELIVERY_QUEUE_PRIORITY,
} from './email-delivery.queue';
import { EmailDeliveryService } from './email-delivery.service';
import { EmailDeliveryProcessor } from './email-delivery.processor';
import { EncryptionModule } from '../encryption/encryption.module';
import { StellarModule } from '../stellar/stellar.module';
import { RedisModule } from '../redis/redis.module';
import { AdminGuard } from './guards/admin.guard';
import { registerQueue } from '../common';
import { QueueOverflowService } from '../common/queue/queue-overflow.service';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    EncryptionModule,
    StellarModule,
    RedisModule,
    PassportModule.register({ session: false }),
    JwtModule.registerAsync({
      useFactory: () => {
        const expires =
          Number(process.env.JWT_EXPIRES) && Number(process.env.JWT_EXPIRES) > 0
            ? Number(process.env.JWT_EXPIRES)
            : 3600;
        return {
          secret: process.env.JWT_SECRET || 'dev_jwt_secret',
          signOptions: { expiresIn: expires },
        };
      },
    }),
    CsrfModule,
    registerQueue(EMAIL_DELIVERY_QUEUE),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    GoogleStrategy,
    JwtStrategy,
    IsStrongPasswordConstraint,
    MailService,
    CookieService,
    DeviceFingerprintService,
    BruteForceProtectionService,
    EmailDeliveryService,
    EmailDeliveryProcessor,
    AdminGuard,
    QueueOverflowService,
  ],
  exports: [MailService, JwtModule, PassportModule, AdminGuard],
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';

/**
 * Authentication Module.
 *
 * Provides:
 * - JWT-based authentication with optional email verification gating
 * - Multi-factor authentication (TOTP) support
 * - Brute-force protection with account lockout (HTTP 423)
 * - Rate limiting on auth endpoints (HTTP 429)
 * - Device fingerprinting for refresh token binding
 * - Login, signup, password reset, and token refresh endpoints
 *
 * Configuration (from environment):
 * - JWT_SECRET — secret used to sign access tokens (default: 'dev_jwt_secret')
 * - JWT_EXPIRES — access-token lifetime in seconds (default: 3600)
 * - BRUTE_FORCE_MAX_ATTEMPTS — failed attempts before lockout (default: 5)
 * - BRUTE_FORCE_WINDOW_DURATION — rolling window for counting attempts (default: 900s)
 * - BRUTE_FORCE_LOCKOUT_DURATION — lockout duration (default: 900s)
 */
@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET') || 'dev_jwt_secret',
        signOptions: {
          expiresIn: configService.get<number>('JWT_EXPIRES') || 3600,
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [JwtStrategy],
  exports: [JwtModule, PassportModule, JwtStrategy],
import { AuthController } from './auth.controller';

/**
 * Authentication Module
 *
 * Provides authentication and authorization services:
 * - JWT-based authentication
 * - OAuth social login (Google, Twitter, Facebook, GitHub)
 * - Password management (forgot/reset)
 * - CSRF token management
 * - Role-based access control
 *
 * This is a placeholder module structure for documentation purposes.
 * In a full implementation, this would include:
 * - AuthService for business logic
 * - JwtStrategy for passport authentication
 * - OAuth strategies for social login
 * - Password hashing and validation
 * - Email service for password reset
 */
@Module({
  imports: [
    // In a real implementation:
    // JwtModule.register({...}),
    // PassportModule,
    // PrismaModule,
    // etc.
  ],
  controllers: [AuthController],
  providers: [
    // In a real implementation:
    // AuthService,
    // JwtStrategy,
    // GoogleStrategy,
    // TwitterStrategy,
    // etc.
  ],
  exports: [
    // In a real implementation:
    // AuthService,
  ],
})
export class AuthModule {}
