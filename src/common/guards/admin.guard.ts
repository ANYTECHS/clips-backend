import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { AppConfigService } from '../../config/app-config.service';

/**
 * Simple admin guard: requires `x-admin-secret` header matching ADMIN_SECRET env var.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly appConfig: AppConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const secret = request.headers['x-admin-secret'];
    const expected = this.appConfig.adminSecret;

    if (!expected || secret !== expected) {
      throw new UnauthorizedException('Admin access required');
    }

    return true;
  }
}
