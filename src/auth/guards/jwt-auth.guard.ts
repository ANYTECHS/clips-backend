import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { throwUnauthorized } from '../../common/helpers/auth-error.helper';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  handleRequest<TUser>(err: unknown, user: TUser): TUser {
    if (err || !user) {
      throwUnauthorized({
        message: 'Authentication required',
        errorCode: 'UNAUTHORIZED',
        reason: err instanceof Error ? err.message : undefined,
      });
    }
    return user;
  }
}
