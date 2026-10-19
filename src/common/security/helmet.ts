import type { INestApplication } from '@nestjs/common';
import helmet from 'helmet';

export function configureHelmet(
  app: INestApplication,
  enableSwaggerUI: boolean,
): void {
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: [`'self'`],
          styleSrc: [`'self'`, `'unsafe-inline'`],
          scriptSrc: enableSwaggerUI ? [`'self'`, `'unsafe-inline'`] : [`'self'`],
          imgSrc: [`'self'`, 'data:', 'https:'],
          connectSrc: [`'self'`],
          fontSrc: [`'self'`],
          objectSrc: [`'none'`],
          mediaSrc: [`'self'`],
          frameSrc: [`'none'`],
        },
      },
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      referrerPolicy: { policy: 'no-referrer' },
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
      },
      noSniff: true,
      hidePoweredBy: true,
      frameguard: {
        action: 'deny',
      },
    }),
  );
}