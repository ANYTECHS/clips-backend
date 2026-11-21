import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { throwForbidden } from '../../common/helpers/auth-error.helper';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();
    const hasRole = requiredRoles.some((role) => user?.role === role);

    if (!hasRole) {
      const isAdminOnly =
        requiredRoles.length === 1 && requiredRoles[0] === 'admin';
      throwForbidden({
        message: isAdminOnly
          ? 'unauthorized-admin'
          : 'Insufficient permissions',
        errorCode: isAdminOnly ? 'UNAUTHORIZED_ADMIN' : 'FORBIDDEN',
        reason: `Required roles: ${requiredRoles.join(', ')}`,
      });
    }

    return true;
  }
}
