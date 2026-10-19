import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';

/**
 * JWT Authentication Guard.
 *
 * Validates JWT tokens from the Authorization header (Bearer scheme).
 * Allows requests marked with @Public() to bypass authentication.
 *
 * On successful validation, attaches the decoded JWT payload to `request.user`.
 *
 * Behavior:
 * - Extracts token from `Authorization: Bearer <token>` header
 * - Validates token signature using JWT_SECRET environment variable
 * - Rejects if email is not verified (emailVerified === false)
 * - Attaches decoded payload to request.user on success
 * - Throws UnauthorizedException for missing, invalid, or expired tokens
 * - Bypasses checks for routes marked with @Public()
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>('isPublic', [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      throw new UnauthorizedException('Missing or invalid authorization header');
    }

    try {
      const payload = this.jwtService.verify(token);

      // Enforce email verification before allowing access
      if (!payload.emailVerified) {
        throw new UnauthorizedException('Email must be verified before access');
      }

      request.user = payload;
      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  private extractTokenFromHeader(request: any): string | undefined {
    const authHeader = request.headers.authorization;
    if (!authHeader) {
      return undefined;
    }

    const [scheme, token] = authHeader.split(' ');
    if (scheme !== 'Bearer' || !token) {
      return undefined;
    }

    return token;
  }
}
