import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import * as bodyParser from 'body-parser';
import * as fs from 'fs';
import * as path from 'path';
import { AppModule } from './app.module';
import { RoyaltyConfigurationService } from './nft/royalty-configuration.service';
import { PayoutsService } from './payouts/payouts.service';
import { StellarWebhookService } from './subscriptions/stellar-webhook.service';
import { MetricsInterceptor } from './metrics/metrics.interceptor';
import { AppLoggerService } from './logger/logger.service';
import {
  getBullMQWorkerConfig,
  validateWorkerConfig,
  getBullMQConnectionConfig,
  validateConnectionConfig,
} from './config/bullmq.config';

const DEFAULT_DEV_ORIGINS = ['http://localhost:3000', 'http://127.0.0.1:3000'];
const DEFAULT_CORS_METHODS = [
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'OPTIONS',
];
const DEFAULT_CORS_HEADERS = [
  'Authorization',
  'Content-Type',
  'Accept',
  'Origin',
  'X-Requested-With',
  'X-Request-Id',
];

function parseCsvEnv(value: string | undefined, fallback: string[]): string[] {
  const parsed =
    value
      ?.split(',')
      .map((entry) => entry.trim())
      .filter(Boolean) ?? [];
  return parsed.length > 0 ? parsed : fallback;
}

function buildCorsOptions(isProduction: boolean) {
  const allowedOrigins = parseCsvEnv(
    process.env.ALLOWED_ORIGINS,
    isProduction ? [] : DEFAULT_DEV_ORIGINS,
  );
  const allowedMethods = parseCsvEnv(
    process.env.ALLOWED_METHODS,
    DEFAULT_CORS_METHODS,
  );
  const allowedHeaders = parseCsvEnv(
    process.env.ALLOWED_HEADERS,
    DEFAULT_CORS_HEADERS,
  );

  return {
    origin: (
      origin: string | undefined,
      callback: (error: Error | null, allow?: boolean) => void,
    ) => {
      if (!origin) {
        callback(null, true);
        return;
      }

      if (!isProduction && DEFAULT_DEV_ORIGINS.includes(origin)) {
        callback(null, true);
        return;
      }

      if (allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error(`Origin ${origin} is not allowed by CORS policy`));
    },
    credentials: true,
    methods: allowedMethods,
    allowedHeaders,
  };
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const logger = new Logger('Bootstrap');
  const isProduction = process.env.NODE_ENV === 'production';
  const enableSwaggerUI = !isProduction || process.env.ENABLE_SWAGGER_UI === 'true';

  // Security headers with Helmet. Registered before any route/router (including
  // Swagger UI below) so every response — docs included — gets these headers;
  // Express only applies middleware to requests that reach it in registration order.
  // Swagger UI's bundled HTML injects an inline <script> to boot SwaggerUIBundle, so
  // scriptSrc needs 'unsafe-inline' whenever the docs UI is exposed; kept locked down
  // otherwise.
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

  if (process.env.TRUST_PROXY === 'true') {
    app.set('trust proxy', 1);
  }

  // Validate BullMQ Redis connection configuration on startup
  const configService = app.get(ConfigService);
  const connectionConfig = getBullMQConnectionConfig(configService);
  try {
    validateConnectionConfig(connectionConfig);
    logger.log(
      `BullMQ connection configuration validated: ` +
        `host=${connectionConfig.redisHost}, port=${connectionConfig.redisPort}`,
    );
  } catch (error) {
    logger.error(`Invalid BullMQ connection configuration: ${error.message}`);
    process.exit(1);
  }

  // Validate BullMQ worker configuration on startup
  const workerConfig = getBullMQWorkerConfig(configService);
  try {
    validateWorkerConfig(workerConfig);
    logger.log(
      `BullMQ worker configuration validated: ` +
        `clip-generation=${workerConfig.clipGenerationConcurrency}, ` +
        `email-delivery=${workerConfig.emailDeliveryConcurrency}`,
    );
  } catch (error) {
    logger.error(`Invalid BullMQ worker configuration: ${error.message}`);
    process.exit(1);
  }

  // Validate royalty configuration on startup
  const royaltyConfigService = app.get(RoyaltyConfigurationService);
  try {
    royaltyConfigService.validateRoyaltyConfiguration();
    logger.log(
      `Royalty configuration validated: ` +
        `creatorRoyaltyBps=${royaltyConfigService.getCreatorRoyaltyBps()}, ` +
        `platformRoyaltyBps=${royaltyConfigService.getPlatformRoyaltyBps()}`,
    );
  } catch (error) {
    logger.error(`Invalid royalty configuration: ${error.message}`);
    process.exit(1);
  }

  // Swagger setup - only available in non-production environments
  const swaggerConfig = new DocumentBuilder()
    .setTitle('ClipCash API')
    .setDescription(
      'ClipCash backend API documentation\n\n' +
      '## Rate Limits\n\n' +
      'All API endpoints are protected by rate limiting to ensure fair usage and system stability.\n\n' +
      '### Rate Limit Tiers\n\n' +
      '| Tier | Limit | Window | Applies To |\n' +
      '|------|-------|--------|------------|\n' +
      '| **Default** | 100 requests | 60 seconds | Most endpoints |\n' +
      '| **Auth** | 10 requests | 60 seconds | Login, registration, password reset |\n' +
      '| **Sensitive** | 3 requests | 15 minutes | MFA setup, account deletion |\n' +
      '| **Email Verify** | 3 requests | 60 minutes | Email verification resend |\n' +
      '| **Clip Generate** | 10 requests | 60 seconds | Clip generation endpoints |\n' +
      '| **NFT Mint** | 5 requests | 60 seconds | NFT minting endpoints |\n' +
      '| **Wallet Connect** | 10 requests | 60 seconds | Wallet connection |\n' +
      '| **Wallet Disconnect** | 10 requests | 60 seconds | Wallet disconnection |\n' +
      '| **Transaction Send** | 5 requests | 60 seconds | Blockchain transactions |\n\n' +
      '### Rate Limit Headers\n\n' +
      'All responses include rate limit information in headers:\n' +
      '- `X-RateLimit-Limit` — Maximum requests allowed in the window\n' +
      '- `X-RateLimit-Remaining` — Requests remaining in current window\n' +
      '- `X-RateLimit-Reset` — Unix timestamp when the limit resets\n\n' +
      '### Rate Limit Exceeded\n\n' +
      'When you exceed the rate limit, you will receive a `429 Too Many Requests` response:\n' +
      '```json\n' +
      '{\n' +
      '  "statusCode": 429,\n' +
      '  "message": "ThrottlerException: Too Many Requests",\n' +
      '  "error": "Too Many Requests"\n' +
      '}\n' +
      '```\n\n' +
      '### Best Practices\n\n' +
      '- Implement exponential backoff when receiving 429 responses\n' +
      '- Monitor rate limit headers to avoid hitting limits\n' +
      '- Cache responses when possible to reduce API calls\n' +
      '- Use webhooks instead of polling for real-time updates\n' +
      '- Contact support for higher limits if needed for production use\n\n' +
      '### IP Whitelisting\n\n' +
      'Trusted IPs can be whitelisted by setting `THROTTLER_WHITELIST` environment variable (comma-separated list).\n\n' +
      '## Security Headers\n\n' +
      'All responses (including this documentation UI) are protected by [Helmet](https://helmetjs.github.io/):\n\n' +
      '| Header | Value | Purpose |\n' +
      '|--------|-------|---------|\n' +
      '| `Content-Security-Policy` | `default-src \'self\'; ...` | Restricts sources for scripts, styles, images, etc. |\n' +
      '| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains; preload` | Forces HTTPS for 1 year |\n' +
      '| `X-Content-Type-Options` | `nosniff` | Prevents MIME-sniffing |\n' +
      '| `X-XSS-Protection` | `0` (modern browsers rely on CSP instead) | Legacy XSS filter header |\n' +
      '| `X-Powered-By` | removed | Hides the underlying framework |\n' +
      '| `X-Frame-Options` | `DENY` | Blocks the API/docs from being framed (clickjacking protection) |\n\n' +
      'The `Content-Security-Policy` directives (`scriptSrc`, `styleSrc`, ...) only relax to allow ' +
      '`\'unsafe-inline\'` scripts when the Swagger UI is enabled (non-production, or ' +
      '`ENABLE_SWAGGER_UI=true`), since the docs page needs an inline script to boot. ' +
      'API JSON responses are never affected by this relaxation.',
      'API JSON responses are never affected by this relaxation.\n\n' +
      '## CSRF Protection\n\n' +
      'All state-changing requests (`POST`, `PUT`, `PATCH`, `DELETE`) that are authenticated via the ' +
      'httpOnly session cookie must also include a CSRF token. Requests using `Authorization: Bearer` ' +
      'or `X-API-Key` (and `GET`/`HEAD`/`OPTIONS` requests) are exempt.\n\n' +
      '| Header | Required | Description |\n' +
      '|--------|----------|-------------|\n' +
      '| `X-CSRF-Token` | Yes, for cookie-authenticated mutations | Must match the `_csrf` cookie value issued at login |\n\n' +
      '### Example request\n\n' +
      '```http\n' +
      'POST /wallets/connect HTTP/1.1\n' +
      'Host: api.clipcash.example\n' +
      'Cookie: _csrf=abc123...\n' +
      'X-CSRF-Token: abc123...\n' +
      'Content-Type: application/json\n\n' +
      '{ "walletAddress": "GC6X..." }\n' +
      '```\n\n' +
      '### Invalid or missing token\n\n' +
      'Returns `403 Forbidden`:\n' +
      '```json\n' +
      '{\n' +
      '  "statusCode": 403,\n' +
      '  "message": "Invalid CSRF token",\n' +
      '  "error": "Forbidden"\n' +
      '}\n' +
      '```\n\n' +
      '## CORS Policy\n\n' +
      'Cross-origin requests are restricted to an explicit allow-list — there is no wildcard (`*`) origin. ' +
      'Swagger UI itself is served from and consumed on the same origin as the API, so it remains fully ' +
      'accessible regardless of the CORS origin allow-list.\n\n' +
      '| Environment | Allowed origins |\n' +
      '|-------------|------------------|\n' +
      '| Development (default) | `http://localhost:3000`, `http://127.0.0.1:3000` |\n' +
      '| Production | Only origins listed in `ALLOWED_ORIGINS` (comma-separated); empty by default |\n\n' +
      'Configure additional development or staging origins with the `ALLOWED_ORIGINS` environment variable, ' +
      'e.g. `ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173`. Allowed methods and headers can ' +
      'similarly be overridden via `ALLOWED_METHODS` and `ALLOWED_HEADERS`.',
    )
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Enter JWT token',
      },
      'access-token',
    )
    .addTag('auth', 'Authentication and authorization')
    .addTag('users', 'User management')
    .addTag('videos', 'Video upload and management')
    .addTag('clips', 'Clip generation and management')
    .addTag('subscriptions', 'Subscription and payment management')
    .addTag('webhooks', 'Webhook endpoints for external services')
    .addTag('wallets', 'Blockchain wallet management')
    .addTag('payouts', 'Revenue payouts')
    .addTag('earnings', 'Earnings tracking')
    .addTag('nfts', 'NFT minting and royalty queries')
    .addTag('nft', 'NFT minting and royalty management')
    .addTag('payout', 'Payout requests and processing')
    .addTag('stellar', 'Stellar network interactions')
    .addTag('jobs', 'Background job management')
    .addTag('platforms', 'Social platform integrations')
    .addTag('admin', 'Admin-only endpoints')
    .addTag('queues', 'BullMQ queue management')
    .addTag('circuit-breaker', 'Circuit breaker monitoring and management')
    .addTag('metrics', 'Prometheus metrics endpoint')
    .addTag('user-platforms', 'Social platform connections')
    .addTag('platform', 'Platform revenue queries')
    .addTag('health', 'System health checks')
    .addTag('blockchain', 'Indexed Soroban contract events')
    .addTag('transactions', 'Blockchain transactions')
    .addTag('payout-methods', 'Payout method management')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);

  // Export OpenAPI spec to file for external use
  const openapiPath = path.join(process.cwd(), 'openapi.json');
  fs.writeFileSync(openapiPath, JSON.stringify(document, null, 2));
  logger.log(`OpenAPI spec exported to ${openapiPath}`);

  // Setup Swagger UI (only in non-production or if explicitly enabled)
  if (enableSwaggerUI) {
    SwaggerModule.setup('api/docs', app, document, {
      swaggerOptions: {
        persistAuthorization: true,
        docExpansion: 'list',
        filter: true,
        showRequestDuration: true,
      },
      customSiteTitle: 'ClipCash API Documentation',
    });
    logger.log(`Swagger UI available at /api/docs`);
  } else {
    logger.log(
      'Swagger UI disabled in production. Set ENABLE_SWAGGER_UI=true to enable.',
    );
  }

  app.enableCors(buildCorsOptions(isProduction));

  // Redundant with helmet's hidePoweredBy(), but explicit about disabling
  // Express defaults that leak framework identity.
  app.getHttpAdapter().getInstance().disable('x-powered-by');

  // Parse cookies (required for httpOnly cookie-based JWT support)
  app.use(cookieParser());

  // Raw body parser for webhook signature verification (must be before JSON parser for specific routes)
  // This preserves the raw body for HMAC signature verification
  app.use('/webhooks/stellar', bodyParser.raw({ type: 'application/json' }));

  // API responses may contain user-specific or sensitive data — prevent
  // shared/browser caches from storing them. Swagger UI is left cacheable.
  app.use((req, res, next) => {
    if (!req.path.startsWith('/api/docs')) {
      res.set('Cache-Control', 'no-store');
    }
    next();
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalInterceptors(app.get(MetricsInterceptor));
  // Enable Nest's shutdown hooks so providers can clean up on signals
  app.enableShutdownHooks();

  // Listen for OS signals and perform a graceful shutdown that waits for
  // in-flight work to finish (e.g. BullMQ processors should finish jobs).
  const shutdown = async (signal: string) => {
    logger.log(`Received ${signal}, shutting down gracefully...`);
    const timeoutMs = Number(process.env.GRACEFUL_SHUTDOWN_TIMEOUT_MS) || 30000;
    const forceExit = setTimeout(() => {
      logger.error(`Shutdown timed out after ${timeoutMs}ms — forcing exit.`);
      process.exit(1);
    }, timeoutMs);

    try {
      await app.close();
      logger.log('Application closed cleanly. Exiting.');
      clearTimeout(forceExit);
      process.exit(0);
    } catch (err) {
      logger.error('Error during application shutdown', err as any);
      clearTimeout(forceExit);
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  await app.listen(process.env.PORT ?? 3000);

  // Start periodic payout verification to confirm on-chain transactions
  try {
    const payoutsService = app.get(PayoutsService);
    const intervalMs = parseInt(
      process.env.PAYOUT_VERIFIER_INTERVAL_MS ?? '60000',
      10,
    );

    // Run once on startup
    void payoutsService
      .listPendingPayouts()
      .catch((err) =>
        logger.error(
          `Payout verifier initial run failed: ${err?.message ?? err}`,
        ),
      );

    // Schedule periodic runs
    setInterval(() => {
      void payoutsService
        .listPendingPayouts()
        .catch((err) =>
          logger.error(`Payout verifier error: ${err?.message ?? err}`),
        );
    }, intervalMs);

    logger.log(`Payout verifier started (interval=${intervalMs}ms)`);
  } catch (err) {
    logger.warn('Payout verifier not started: PayoutsService not available');
  }

  // Start Stellar transaction listener for subscription payments
  try {
    const stellarWebhookService = app.get(StellarWebhookService);
    await stellarWebhookService.startTransactionListener();
  } catch (err) {
    logger.warn('Stellar transaction listener not started');
  }
}
bootstrap();
