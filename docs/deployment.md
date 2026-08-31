# ClipCash — Production Deployment Guide

This document covers the complete process for deploying the ClipCash backend to production. It includes frontend deployment, backend deployment, Docker setup, database and Redis configuration, Stellar network configuration, environment variables, health checks, and Swagger/API documentation settings.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Environment Variables](#environment-variables)
3. [Docker Deployment (recommended)](#docker-deployment-recommended)
4. [Backend Deployment (manual)](#backend-deployment-manual)
5. [Frontend Deployment](#frontend-deployment)
6. [Database Configuration](#database-configuration)
7. [Redis Configuration](#redis-configuration)
8. [Stellar Network Configuration](#stellar-network-configuration)
9. [Health Checks](#health-checks)
10. [Swagger & API Documentation in Production](#swagger--api-documentation-in-production)
11. [CORS Configuration](#cors-configuration)
12. [Troubleshooting](#troubleshooting)

---

## Prerequisites

| Requirement | Minimum Version |
|-------------|----------------|
| Node.js     | 18.x LTS       |
| npm         | 9.x             |
| PostgreSQL  | 14.x            |
| Redis       | 7.x             |
| Docker      | 24.x (optional) |
| Docker Compose | 2.x (optional) |

Ensure the following external services are provisioned before deploying:

- Cloudinary account (video CDN)
- Ayrshare account (social posting API)
- Pinata account (IPFS / NFT metadata)
- Stellar network access (testnet or mainnet)
- SMTP provider (email delivery)

---

## Environment Variables

Copy `.env.example` to `.env` (or inject variables via your CI/CD platform) and fill in every value:

```bash
cp .env.example .env
```

### Required Variables

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string, e.g. `postgresql://user:pass@host:5432/clipscash?schema=public` |
| `ENCRYPTION_SECRET` | ≥32-character secret for encrypting sensitive data at rest. Generate with `openssl rand -base64 32` |
| `JWT_SECRET` | Random string used to sign JWT tokens |
| `REDIS_HOST` / `REDIS_PORT` | Redis host and port (BullMQ, rate limiting, cache) |
| `STELLAR_NETWORK` | `testnet` or `public` (mainnet) |
| `SOROBAN_NFT_CONTRACT_ID` | Deployed Soroban smart contract address |
| `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` | Cloudinary credentials |
| `AYRSHARE_API_KEY` | Ayrshare API key for social posting |
| `PINATA_JWT` | Pinata JWT for IPFS uploads |
| `WEBHOOK_SECRET` | HMAC-SHA256 secret for validating incoming Stellar payment webhooks |
| `METRICS_TOKEN` | Bearer token protecting the `/metrics` Prometheus endpoint |

### Optional / Tuning Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP server port |
| `NODE_ENV` | `development` | Set to `production` for production builds |
| `JWT_EXPIRES` | `3600` | Access token TTL in seconds |
| `JWT_REFRESH_EXPIRES_DAYS` | `14` | Refresh token TTL in days |
| `ALLOWED_ORIGINS` | `http://localhost:3000` | Comma-separated CORS whitelist |
| `BULLMQ_CLIP_GENERATION_CONCURRENCY` | `2` | Parallel clip-generation jobs per worker |
| `BULLMQ_EMAIL_DELIVERY_CONCURRENCY` | `5` | Parallel email delivery jobs |
| `MIN_PAYOUT_USD` / `MAX_PAYOUT_USD` | `5` / `10000` | Payout limits in USD |
| `LEADERBOARD_ENABLED` | `false` | Enable public earnings leaderboard |
| `ENABLE_SWAGGER_UI` | `false` in production | Override Swagger visibility |

---

## Docker Deployment (recommended)

### 1. Build and Start All Services

```bash
# Start PostgreSQL + Redis
docker compose up -d

# Verify containers are running
docker compose ps
```

The `docker-compose.yml` starts:
- `postgres` — PostgreSQL 16 on port `5432`
- `redis` — Redis 7 on port `6379` with append-only persistence

### 2. Install Dependencies and Run Migrations

```bash
npm ci --production
npx prisma migrate deploy
```

> Use `migrate deploy` (not `migrate dev`) in production. It applies pending migrations without regenerating the Prisma client or prompting interactively.

### 3. Build and Start the API

```bash
npm run build
node dist/main.js
```

Or use a process manager such as PM2:

```bash
npm install -g pm2
pm2 start dist/main.js --name clipcash-api --instances max
pm2 save
pm2 startup
```

### 4. Docker Production Image (optional)

Create a `Dockerfile` at the project root:

```dockerfile
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:18-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "dist/main.js"]
```

```bash
docker build -t clipcash-api:latest .
docker run -d --env-file .env -p 3000:3000 clipcash-api:latest
```

---

## Backend Deployment (manual)

### 1. Clone and Install

```bash
git clone https://github.com/ANYTECHS/clips-backend.git
cd clips-backend
npm ci --production
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env and set all required variables
```

### 3. Run Database Migrations

```bash
npx prisma migrate deploy
```

### 4. Build

```bash
npm run build
```

### 5. Start

```bash
NODE_ENV=production node dist/main.js
```

---

## Frontend Deployment

The frontend (Next.js 15) is a separate repository. Deployment steps:

1. Set `NEXT_PUBLIC_API_URL` to the backend API base URL (e.g. `https://api.clipcash.app`).
2. Set `NEXT_PUBLIC_STELLAR_NETWORK` to match `STELLAR_NETWORK` on the backend (`testnet` or `public`).
3. Build and deploy to Vercel, Netlify, or any static/serverless host:

```bash
npm run build
npm run start   # or deploy the .next/ output folder
```

---

## Database Configuration

### Connection String Format

```
postgresql://<user>:<password>@<host>:<port>/<database>?schema=public
```

### Production Recommendations

- Use a managed database (e.g. AWS RDS, Supabase, Neon) for automated backups and failover.
- Enable SSL: append `&sslmode=require` to the connection string.
- Set `connection_pool_timeout` and `pool_max` via Prisma's `datasource` config if connection pooling is needed.

### Migrations

```bash
# Apply all pending migrations (production-safe)
npx prisma migrate deploy

# View migration status
npx prisma migrate status

# NEVER run in production (resets the database):
# npx prisma migrate reset
```

### Database Health Check

```bash
npx prisma db execute --stdin <<< "SELECT 1;"
```

---

## Redis Configuration

### Connection Variables

```env
REDIS_HOST=your-redis-host
REDIS_PORT=6379
REDIS_PASSWORD=your-redis-password   # leave empty if no auth
```

### Production Recommendations

- Use a managed Redis (e.g. AWS ElastiCache, Upstash, Redis Cloud) with persistence enabled.
- Enable `appendonly yes` for durability (already set in the dev `docker-compose.yml`).
- Set `maxmemory-policy allkeys-lru` to prevent memory exhaustion under queue load.

### BullMQ Queue Redis (separate config)

For high-throughput deployments you can point BullMQ at a separate Redis instance:

```env
QUEUE_REDIS_HOST=your-queue-redis-host
QUEUE_REDIS_PORT=6379
QUEUE_REDIS_PASSWORD=your-queue-password
QUEUE_REDIS_TLS=true
```

---

## Stellar Network Configuration

### Switching Between Testnet and Mainnet

Set `STELLAR_NETWORK` in `.env`:

| Value    | Network       | Soroban RPC URL                                   | When to use          |
|----------|---------------|---------------------------------------------------|----------------------|
| `testnet`| Stellar Testnet | `https://soroban-testnet.stellar.org`           | Development, staging |
| `public` | Stellar Mainnet | `https://soroban-rpc.stellar.org`               | Production           |

```env
# Staging
STELLAR_NETWORK=testnet
SOROBAN_NFT_CONTRACT_ID=your-testnet-contract-id

# Production
STELLAR_NETWORK=public
SOROBAN_NFT_CONTRACT_ID=your-mainnet-contract-id
```

### Platform Payout Wallet

The backend uses `STELLAR_PLATFORM_SECRET` (a Stellar keypair secret) to sign payout transactions. This must be set securely in production — **never commit this value**:

```env
STELLAR_PLATFORM_SECRET=S...your-secret-key
```

### Minimum Payout Threshold

Micro-transactions that don't cover Stellar fees are rejected automatically:

```env
MIN_STELLAR_PAYOUT=5   # USD equivalent, default: 5
```

---

## Health Checks

### `GET /health`

Returns overall service health including database, Redis, and queue connectivity.

```bash
curl https://api.clipcash.app/health
```

Example healthy response:

```json
{
  "status": "ok",
  "info": {
    "database": { "status": "up" },
    "redis": { "status": "up" },
    "queue": { "status": "up" }
  },
  "error": {},
  "details": {
    "database": { "status": "up" },
    "redis": { "status": "up" },
    "queue": { "status": "up" }
  }
}
```

### `GET /metrics`

Prometheus-compatible metrics endpoint, protected by `METRICS_TOKEN`:

```bash
curl -H "x-metrics-token: $METRICS_TOKEN" https://api.clipcash.app/metrics
```

Key metrics exposed:
- `clipcash_clips_generated_total` — total clip generation jobs by status
- `clipcash_nft_mints_total` — NFT mint attempts by status
- `clipcash_job_queue_depth` — current queue depth per queue
- `clipcash_http_request_duration_seconds` — request latency histogram
- `clipcash_stellar_rpc_errors_total` — Stellar RPC error count
- `clipcash_cloudinary_upload_errors_total` — Cloudinary upload error count

### Process Manager Health (PM2)

```bash
pm2 status
pm2 logs clipcash-api --lines 50
```

---

## Swagger & API Documentation in Production

### Default Behaviour

Swagger UI is **disabled in production** by default (`NODE_ENV=production`). This prevents public exposure of your API schema.

### Enabling Swagger in Production

If you need Swagger accessible in a private production/staging environment:

```env
ENABLE_SWAGGER_UI=true
```

Swagger UI will then be available at:

```
https://api.clipcash.app/api/docs
```

OpenAPI JSON spec:

```
https://api.clipcash.app/api/docs-json
```

### API Version

The current API does not use URL versioning. All endpoints are served from `/` (e.g. `/clips`, `/wallets`).

### Exporting the OpenAPI Spec

```bash
npm run openapi:export
# Outputs openapi.json in the project root
```

Use this file with Postman, Insomnia, or OpenAPI code generators.

---

## CORS Configuration

Set `ALLOWED_ORIGINS` to a comma-separated list of frontend origins that should be allowed to call the API:

```env
# Development
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001

# Production
ALLOWED_ORIGINS=https://clipcash.app,https://www.clipcash.app
```

The backend will reject cross-origin requests from any origin not in this list.

> If you are running Swagger UI from a different domain than the API, add that domain to `ALLOWED_ORIGINS`.

---

## Troubleshooting

| Symptom | Likely Cause | Resolution |
|---|---|---|
| `Can't reach database server` | Wrong `DATABASE_URL` or DB not running | Verify host, port, user, password; check `pg_isready` |
| `Redis connection refused` | Redis not running or wrong host/port | Start Redis; verify `REDIS_HOST` and `REDIS_PORT` |
| `SOROBAN_NFT_CONTRACT_ID` errors | Contract not deployed for the configured network | Deploy the Soroban contract to the active network and update the env var |
| `401 Unauthorized` on all endpoints | Missing or expired JWT | Obtain a fresh token via `/auth/login`; send `Authorization: Bearer <token>` |
| `403 Forbidden` on admin routes | User does not have `admin` role in the database | Update the user's `role` column in the `User` table |
| Prisma migration failures | Pending unapplied migrations or schema mismatch | Run `npx prisma migrate deploy`; check `npx prisma migrate status` |
| Port 3000 already in use | Another process on the same port | Set `PORT=<other_port>` in `.env` or kill the conflicting process |
| `STELLAR_PLATFORM_SECRET` missing | Env var not set in production | Add the secret to your deployment environment; never commit it |
| Queue jobs not processing | BullMQ workers not started | Ensure the worker processes are running (they are embedded in `main.ts`) |
| High memory usage | Redis `maxmemory` not configured | Set `maxmemory` and `maxmemory-policy allkeys-lru` in Redis config |

For Stellar-specific integration details see [docs/stellar-integration.md](./stellar-integration.md).
