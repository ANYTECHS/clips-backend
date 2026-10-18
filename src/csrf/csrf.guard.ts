import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { CsrfService } from './csrf.service';

@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(private readonly csrfService: CsrfService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();

    // Skip CSRF for GET, HEAD, OPTIONS requests
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      return true;
    }

    // Skip CSRF for public routes and API key routes
    const publicPaths = [
      '/auth/signup',
      '/auth/login',
      '/auth/magic-link',
      '/auth/verify-magic',
      '/auth/verify-email',
      '/auth/forgot-password',
      '/auth/reset-password',
      '/auth/google',
      '/auth/google/callback',
      '/api',
    ];

    const isPublicPath = publicPaths.some((path) =>
      request.path.startsWith(path),
    );
    const hasApiKey = request.headers['x-api-key'];

    if (isPublicPath || hasApiKey) {
      return true;
    }

    // Validate CSRF token for state-changing requests
    const token =
      (request.headers['x-csrf-token'] as string) || request.body?._csrf;
    const cookieToken = request.cookies['_csrf'];

    if (!this.csrfService.validateToken(token, cookieToken)) {
      throw new ForbiddenException('Invalid CSRF token');
    }

    return true;
  }
}
