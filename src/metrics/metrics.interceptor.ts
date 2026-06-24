import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const start = Date.now();

    return next.handle().pipe(
      tap(() => {
        const durationMs = Date.now() - start;
        if (process.env.NODE_ENV === 'development') {
          const method = request?.method ?? 'UNKNOWN';
          const url = request?.url ?? 'UNKNOWN';
          // Lightweight request timing for local debugging.
          void durationMs;
          void method;
          void url;
        }
      }),
    );
  }
}
