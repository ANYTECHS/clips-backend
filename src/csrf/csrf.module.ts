import { Module, MiddlewareConsumer, RequestMethod } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { CsrfService } from './csrf.service';
import { CsrfGuard } from './csrf.guard';
import { AppConfigModule } from '../config/config.module';

@Module({
  imports: [AppConfigModule],
  providers: [
    CsrfService,
    {
      provide: APP_GUARD,
      useClass: CsrfGuard,
    },
  ],
  exports: [CsrfService],
})
export class CsrfModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply((req: any, res: any, next: any) => {

        // Skip CSRF for GET, HEAD, OPTIONS requests
        if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
          return next();
        }

        // Skip CSRF for public routes and API key routes
        const publicPaths = [
          '/auth/signup',
          '/auth/login',
          '/auth/magic-link',
          '/auth/verify-magic',
          '/auth/verify-email',
          '/auth/forgot-password',
          '/auth/reset-password',
          '/auth/google',
          '/auth/google/callback',
          '/api',
        ];

        const isPublicPath = publicPaths.some((path) =>
          req.path.startsWith(path),
        );
        const hasApiKey = req.headers['x-api-key'];

        if (isPublicPath || hasApiKey) {
          return next();
        }

        // Validate CSRF token for state-changing requests
        const token = req.headers['x-csrf-token'] || req.body._csrf;
        const cookieToken = req.cookies['_csrf'];

        if (!token || !cookieToken || token !== cookieToken) {
          return res.status(403).json({ message: 'Invalid CSRF token' });
        }

        next();
      })
      .forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}
