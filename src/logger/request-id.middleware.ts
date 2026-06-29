import { Injectable, NestMiddleware } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

declare module 'express' {
  interface Request {
    requestId?: string;
  }
}

/**
 * Generates a UUID requestId for every incoming HTTP request.
 * - Reads X-Request-Id header if provided by upstream proxy
 * - Otherwise generates a new UUID v4
 * - Attaches to req.requestId and echoes back in X-Request-Id response header
 */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const requestId =
      (req.headers['x-request-id'] as string | undefined) ?? randomUUID();
    req.requestId = requestId;
    res.setHeader('X-Request-Id', requestId);
    next();
  }
}
