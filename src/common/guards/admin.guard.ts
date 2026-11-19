import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';

/**
 * Simple admin guard: requires `x-admin-secret` header matching ADMIN_SECRET env var.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const secret = request.headers['x-admin-secret'];
    const expected = process.env.ADMIN_SECRET;

    if (!expected || secret !== expected) {
      throw new UnauthorizedException('Admin access required');
    }

    return true;
  }
}
