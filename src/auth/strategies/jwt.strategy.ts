import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

/**
 * JWT payload structure.
 * Issued by AuthService.issueTokens() and verified by JwtStrategy.
 */
export interface JwtPayload {
  /** User ID (sub claim) */
  sub: number;
  /** User email address */
  email: string | null;
  /** Whether email is verified */
  emailVerified: boolean;
  /** Issued at (standard JWT claim) */
  iat?: number;
  /** Expires at (standard JWT claim) */
  exp?: number;
}

/**
 * JWT Passport Strategy.
 *
 * Validates JWT tokens and extracts the payload.
 * Used by JwtAuthGuard to verify tokens from the Authorization header.
 *
 * Configuration:
 * - Secret: process.env.JWT_SECRET or 'dev_jwt_secret'
 * - Extraction: Bearer token from Authorization header
 * - Validation: Signature verification and expiration check (done by Passport)
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey:
        configService.get<string>('JWT_SECRET') || 'dev_jwt_secret',
    });
  }

  async validate(payload: JwtPayload): Promise<JwtPayload> {
    return payload;
  }
}
