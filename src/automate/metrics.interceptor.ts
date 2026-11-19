import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, finalize } from 'rxjs';
import { MetricsService } from './metrics.service';

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(private readonly metricsService: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest();
    const res = http.getResponse();
    const start = process.hrtime.bigint();

    return next.handle().pipe(
      finalize(() => {
        const durationNs = Number(process.hrtime.bigint() - start);
        const durationSeconds = durationNs / 1_000_000_000;
        this.metricsService.observeHttpDuration({
          method: req.method,
          route: req.route?.path ?? req.path ?? 'unknown',
          statusCode: res.statusCode ?? 500,
          seconds: durationSeconds,
        });
      }),
    );
  }
}
