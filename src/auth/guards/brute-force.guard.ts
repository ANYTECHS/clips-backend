import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { BruteForceProtectionService } from '../brute-force-protection.service';

@Injectable()
export class BruteForceGuard implements NestInterceptor {
  constructor(
    private readonly bruteForceService: BruteForceProtectionService,
  ) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<any>> {
    const request = context.switchToHttp().getRequest();
    const email = request.body?.email;

    if (!email) {
      return next.handle();
    }

    // Check if account is already locked
    const lockStatus = await this.bruteForceService.isAccountLocked(email);
    if (lockStatus.isLocked) {
      throw new HttpException(
        {
          message:
            'Account temporarily locked due to too many failed login attempts',
          lockoutTimeLeft: lockStatus.lockoutTimeLeft,
          error: 'ACCOUNT_LOCKED',
        },
        HttpStatus.LOCKED,
      );
    }

    return next.handle();
  }
}
