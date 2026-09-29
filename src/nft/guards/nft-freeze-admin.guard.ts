import {
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AdminGuard } from '../../common/guards/admin.guard';

@Injectable()
export class NftFreezeAdminGuard extends AdminGuard {
  canActivate(context: ExecutionContext): boolean {
    try {
      return super.canActivate(context);
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw new ForbiddenException('Admin access required');
      }
      throw error;
    }
  }
}