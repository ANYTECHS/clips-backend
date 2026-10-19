import { Module } from '@nestjs/common';
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
