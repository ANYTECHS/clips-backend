import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import * as bodyParser from 'body-parser';
import * as fs from 'fs';
import * as path from 'path';
import { AppModule } from './app.module';
import { configureHelmet } from './common/security/helmet';
import { RoyaltyConfigurationService } from './nft/royalty-configuration.service';
import { PayoutsService } from './payouts/payouts.service';
import { StellarWebhookService } from './subscriptions/stellar-webhook.service';
import { MetricsInterceptor } from './metrics/metrics.interceptor';
import { AppLoggerService } from './logger/logger.service';
import { createGlobalValidationPipe } from './common/pipes/global-validation.pipe';
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

  configureHelmet(app, enableSwaggerUI);

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
  // The Swagger UI itself is served at /api/docs and works seamlessly with Helmet.
  // CSP exceptions are configured above to allow:
  // - script-src 'unsafe-inline' for SwaggerUIBundle initialization
  // - style-src 'unsafe-inline' for Swagger styles
  // These exceptions only apply when ENABLE_SWAGGER_UI=true.
  const swaggerConfig = new DocumentBuilder()
    .setTitle('ClipCash API')
    .setDescription(
      'ClipCash backend API documentation\n\n' +
      '## Authentication\n\n' +
      'The API supports multiple authentication methods:\n\n' +
      '### Bearer Token (JWT)\n\n' +
      'Most endpoints use JWT Bearer tokens in the `Authorization` header:\n\n' +
      '```http\n' +
      'GET /clips HTTP/1.1\n' +
      'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...\n' +
      '```\n\n' +
      '**Obtaining a Token:**\n\n' +
      '1. Call `POST /auth/login` with email and password\n' +
      '2. Response includes `accessToken` (JWT) and optional `refreshToken`\n' +
      '3. Include `accessToken` in `Authorization: Bearer <token>` header for authenticated requests\n' +
      '4. Access tokens expire after `JWT_EXPIRES` seconds (default 3600s)\n' +
      '5. Use `refreshToken` with `POST /auth/refresh` to get a new access token\n\n' +
      '**Token Claims:**\n\n' +
      '- `sub`: User ID (numeric)\n' +
      '- `email`: User email address\n' +
      '- `emailVerified`: Boolean (false tokens are rejected by protected endpoints)\n' +
      '- `iat`: Token issued-at timestamp\n' +
      '- `exp`: Token expiration timestamp\n\n' +
      '### Cookie Authentication\n\n' +
      'Alternatively, tokens can be sent via secure httpOnly cookies:\n\n' +
      '```http\n' +
      'GET /clips HTTP/1.1\n' +
      'Cookie: access_token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...\n' +
      'X-CSRF-Token: abc123def456\n' +
      '```\n\n' +
      '**Cookie Attributes:**\n\n' +
      '- `httpOnly: true` — JavaScript cannot access via `document.cookie` (XSS protection)\n' +
      '- `secure: true` — Only sent over HTTPS connections\n' +
      '- `sameSite: strict` — Only sent with same-site requests (CSRF protection)\n' +
      '- `path: /` — Sent to all API paths\n\n' +
      '**CSRF Protection:**\n\n' +
      'When using cookie authentication, state-changing requests (POST, PUT, PATCH, DELETE) must include:\n\n' +
      '```http\n' +
      'POST /wallets/connect HTTP/1.1\n' +
      'Cookie: access_token=...; _csrf=abc123...\n' +
      'X-CSRF-Token: abc123\n' +
      'Content-Type: application/json\n\n' +
      '{ "walletAddress": "GABC..." }\n' +
      '```\n\n' +
      'The `X-CSRF-Token` header value must match the `_csrf` cookie value.\n\n' +
      '### Logout\n\n' +
      'Call `POST /auth/logout` to invalidate the current session:\n\n' +
      '```http\n' +
      'POST /auth/logout HTTP/1.1\n' +
      'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...\n' +
      'Content-Type: application/json\n\n' +
      '{ "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." }\n' +
      '```\n\n' +
      '**Response (200 OK):**\n\n' +
      '```json\n' +
      '{ "message": "Logged out successfully" }\n' +
      '```\n\n' +
      '**Errors:**\n\n' +
      '- `401 Unauthorized` — Invalid or missing access token\n' +
      '- `400 Bad Request` — Invalid refresh token (if provided for revocation)\n\n' +
      '### Token Refresh\n\n' +
      'To obtain a new access token using a refresh token:\n\n' +
      '```http\n' +
      'POST /auth/refresh HTTP/1.1\n' +
      'Content-Type: application/json\n\n' +
      '{ "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." }\n' +
      '```\n\n' +
      '**Response (200 OK):**\n\n' +
      '```json\n' +
      '{\n' +
      '  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",\n' +
      '  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."\n' +
      '}\n' +
      '```\n\n' +
      '**Errors:**\n\n' +
      '- `401 Unauthorized` — Refresh token invalid, expired, or revoked\n\n' +
      '## API Security Contract\n\n' +
      'All protected endpoints must require server-side authentication and authorization. ' +
      'JWT bearer auth is required for authenticated API traffic, `401 Unauthorized` is returned ' +
      'for missing or invalid credentials, `403 Forbidden` is returned for authenticated-but-not-authorized access, ' +
      'and `429 Too Many Requests` is returned when a throttle limit is exceeded.\n\n' +
      'Sensitive endpoints should also advertise their security contract in Swagger via `@ApiBearerAuth`, ' +
      '`@ApiUnauthorizedResponse`, `@ApiForbiddenResponse`, and `@ApiTooManyRequestsResponse` decorators.\n\n' +
      '## Encrypted Fields\n\n' +
      '**IMPORTANT:** The following sensitive fields are encrypted in the database and are **NEVER** returned in API responses:\n\n' +
      '- `accessToken` (social platform integration tokens)\n' +
      '- `refreshToken` (social platform integration refresh tokens)\n' +
      '- `platformPassword` (third-party platform credentials)\n' +
      '- `apiSecret` (internal API secrets)\n' +
      '- `webhookSecret` (webhook signing secrets)\n' +
      '- `stripeToken` (payment processor tokens)\n' +
      '- `privateKey` (blockchain private keys if stored)\n\n' +
      'If you ever encounter these fields in an API response body, it is a **security vulnerability** that must be reported immediately.\n\n' +
      'Instead, response DTOs mask sensitive identifiers (e.g., `GABC...X92K` for wallet addresses) or omit them entirely.\n\n' +
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
      'similarly be overridden via `ALLOWED_METHODS` and `ALLOWED_HEADERS`.\n\n' +
      '### Swagger UI Accessibility\n\n' +
      'Swagger UI remains fully accessible even with CORS restrictions in place. ' +
      'The Swagger UI is served from the same origin as the API (`/api/docs` in non-production or when `ENABLE_SWAGGER_UI=true`), ' +
      'so it is not affected by CORS policy restrictions and remains accessible regardless of the `ALLOWED_ORIGINS` configuration.\n\n' +
      '## Correlation / Request IDs\n\n' +
      'Every request is assigned a correlation ID for end-to-end tracing:\n\n' +
      '| Header | Direction | Description |\n' +
      '|--------|-----------|-------------|\n' +
      '| `X-Request-Id` | Request (optional) | Client or proxy may supply an ID; otherwise the API generates a UUID v4 |\n' +
      '| `X-Request-Id` | Response | Echoed on every response so clients can correlate with support/logs |\n\n' +
      'Error response bodies also include `requestId` when available. Example:\n' +
      '```json\n' +
      '{\n' +
      '  "statusCode": 404,\n' +
      '  "message": "Not Found",\n' +
      '  "error": "Not Found",\n' +
      '  "requestId": "550e8400-e29b-41d4-a716-446655440000"\n' +
      '}\n' +
      '```\n\n' +
      'Internal stack traces are **never** returned in API or Swagger responses. ' +
      'Use the `requestId` when contacting support or searching structured application logs.\n\n' +
      '## Stellar Network\n\n' +
      'The Stellar network is selected with the `STELLAR_NETWORK` environment variable:\n\n' +
      '| Value | Network | Horizon | Soroban RPC |\n' +
      '|-------|---------|---------|-------------|\n' +
      '| `testnet` (default) | Stellar Testnet | `https://horizon-testnet.stellar.org` | `https://soroban-testnet.stellar.org` |\n' +
      '| `public` | Stellar Mainnet | `https://horizon.stellar.org` | `https://soroban-rpc.stellar.org` |\n\n' +
      'Wallet balances, NFT minting, payouts and payment listening all target the configured network. ' +
      'Addresses and transaction hashes from one network are not valid on the other.\n\n' +
      '## Minimum Payout\n\n' +
      'Payout requests below `MIN_STELLAR_PAYOUT` (USD equivalent, default `5`) are rejected with `400 Bad Request`:\n' +
      '```json\n' +
      '{\n' +
      '  "statusCode": 400,\n' +
      '  "message": "Minimum payout amount is 5 USD equivalent. Requested: 3 USD.",\n' +
      '  "error": "Bad Request"\n' +
      '}\n' +
      '```\n\n' +
      '## API Versioning\n\n' +
      'This OpenAPI document reflects the current public API surface (SemVer; see `CHANGELOG.md` and `docs/versioning.md`). ' +
      'Breaking API changes bump the major version and are reflected in this Swagger/OpenAPI spec.',
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
    .addCookieAuth(
      'access_token',
      {
        type: 'apiKey',
        in: 'cookie',
        name: 'access_token',
        description: 'JWT access token sent via secure httpOnly cookie. ' +
          'Cookie attributes: httpOnly=true, secure=true, sameSite=strict, path=/. ' +
          'Must be paired with X-CSRF-Token header for state-changing requests.',
      },
    )
    .addCookieAuth(
      '_csrf',
      {
        type: 'apiKey',
        in: 'cookie',
        name: '_csrf',
        description: 'CSRF protection token cookie. Value must match X-CSRF-Token header.',
      },
    )
    .addApiKey(
      {
        type: 'apiKey',
        in: 'header',
        name: 'X-CSRF-Token',
        description: 'CSRF token for cookie-authenticated state-changing requests (POST, PUT, PATCH, DELETE). ' +
          'Must match the _csrf cookie value. Not needed with Bearer authentication.',
      },
      'csrf-token',
    )
    .addTag('auth', 'Authentication and authorization — login, logout, token refresh, signup. All responses contain JWT tokens for Bearer authentication.')
    .addTag('users', 'User management')
    .addTag('auth', 'Authentication, login, registration, email verification, and two-factor authentication (2FA)')
    .addTag('users', 'User profile management and wallet creation')
    .addTag('videos', 'Video upload and management')
    .addTag('clips', 'Clip generation and management')
    .addTag('subscriptions', 'Subscription plans and lifecycle')
    .addTag('payments', 'Fiat and Stellar subscription payments')
    .addTag('webhooks', 'Webhook endpoints for external services')
    .addTag('wallets', 'Blockchain wallet management and Stellar wallet connections')
    .addTag('payouts', 'Revenue payouts and payout requests')
    .addTag('earnings', 'Earnings tracking, history, and exports')
    .addTag('nfts', 'NFT minting, royalty queries, and metadata')
    .addTag('nft', 'NFT minting and royalty management')
    .addTag('payout', 'Payout requests and processing')
    .addTag('stellar', 'Stellar network interactions and blockchain operations')
    .addTag('jobs', 'Background job management and processing')
    .addTag('platforms', 'Social platform integrations')
    .addTag('admin', 'Admin-only endpoints for platform management')
    .addTag('queues', 'BullMQ queue management and monitoring')
    .addTag('Authentication', 'Authentication and authorization')
    .addTag('Users', 'User management')
    .addTag('Videos', 'Video upload and management')
    .addTag('Clips', 'Clip generation and management')
    .addTag('Subscriptions', 'Subscription plans and lifecycle')
    .addTag('Payments', 'Fiat and Stellar subscription payments')
    .addTag('Webhooks', 'Webhook endpoints for external services')
    .addTag('Wallets', 'Blockchain wallet management')
    .addTag('Payouts', 'Revenue payouts and payout methods')
    .addTag('earnings', 'Earnings tracking')
    .addTag('NFTs', 'NFT minting and royalty management')
    .addTag('stellar', 'Stellar network interactions')
    .addTag('jobs', 'Background job management')
    .addTag('platforms', 'Social platform integrations')
    .addTag('admin', 'Admin-only endpoints — restricted to users with admin role. Returns 403 Forbidden if called without admin authorization. Requires Bearer JWT with admin role claim.')
    .addTag('Admin', 'Admin-only endpoints')
    .addTag('queues', 'BullMQ queue management')
    .addTag('circuit-breaker', 'Circuit breaker monitoring and management')
    .addTag('metrics', 'Prometheus metrics endpoint for monitoring')
    .addTag('user-platforms', 'Social platform connections and OAuth integrations')
    .addTag('platform', 'Platform revenue queries and analytics')
    .addTag('health', 'System health checks and readiness probes')
    .addTag('blockchain', 'Indexed Soroban contract events and blockchain indexing')
    .addTag('transactions', 'Blockchain transactions and transaction history')
    .addTag('payout-methods', 'Payout method management (Stellar, bank transfer, etc.)')
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

  app.useGlobalPipes(createGlobalValidationPipe());

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
