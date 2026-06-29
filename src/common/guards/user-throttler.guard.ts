import { Injectable } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerRequest } from '@nestjs/throttler';

/**
 * Extends ThrottlerGuard to key rate limits by authenticated user ID
 * when available, falling back to IP for unauthenticated requests.
 */
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const userId = req.user?.id;
    return userId ? `user:${userId}` : (req.ip as string);
  }

  protected async getErrorMessage(): Promise<string> {
    return 'Too many requests. Please try again later.';
  }

  async handleRequest(requestProps: ThrottlerRequest): Promise<boolean> {
    return super.handleRequest(requestProps);
  }
}
