# ClipCash

**Turn your long videos into short viral clips — automatically, with full control, and optional NFT ownership.**

ClipCash helps content creators (YouTubers, podcasters, gamers, coaches…) save many hours of work by turning one long video into dozens or hundreds of short clips ready for TikTok, Instagram Reels, YouTube Shorts, and more.

You always stay in control:
→ Preview every clip
→ Choose which ones you like
→ Delete the bad ones
→ Then post only the good ones automatically

**Bonus: you can also turn your best clips into NFTs on the Stellar network (very cheap & fast) so you truly own them and can earn royalties forever.**

## What makes ClipCash special?

- **Full preview & selection** — most tools post random clips. ClipCash lets you see and pick only the best ones.
- **Automatic posting** to 7+ platforms (TikTok, Instagram, YouTube Shorts, Facebook Reels, Snapchat Spotlight, Pinterest, LinkedIn)
- **Web2 + Web3 in one app** — normal accounts + optional Stellar NFTs with royalties
- **Simple & beautiful interface** — dark mode, clean design, easy to use

## Key Features

### Content Creation & AI
- **AI-powered clip detection** — Claude analyzes video content to find the most engaging moments (15–60 seconds each)
- **Fallback strategies** — if AI fails, uses fixed-chunk splitting to ensure something is always generated
- **Multi-source support** — upload local video, YouTube, TikTok, or any public video URL
- **Video metadata extraction** — automatic duration, resolution, quality detection via FFmpeg

### Clip Management
- **Preview interface** — watch each generated clip before posting
- **Bulk actions** — select/deselect/delete multiple clips at once
- **Metadata editing** — customize title, caption, hashtags per clip
- **Viral scoring** — AI assigns engagement scores to help you pick winners

### Multi-Platform Publishing
- **One-click posting** — publish to TikTok, Instagram Reels, YouTube Shorts, Facebook Reels, Snapchat, Pinterest, LinkedIn
- **Platform-specific formatting** — auto-adjust duration, aspect ratio, captions
- **Scheduled posting** — queue clips to publish at optimal times
- **Post tracking** — monitor views, likes, comments per platform

### Web3 Integration (Stellar)
- **Optional NFT minting** — turn clips into NFTs on Stellar's Soroban network
- **Built-in royalties** — earn a percentage on secondary sales (customizable)
- **Very low fees** — Stellar transactions cost ~$0.00001 (1 stroops)
- **User-controlled wallets** — all signing happens in user's browser with Freighter or Albedo

### Revenue & Analytics
- **Earnings dashboard** — aggregate earnings from all platforms in one place
- **Payout system** — withdraw earnings in XLM (Stellar lumens) to your wallet
- **Subscription plans** — flexible tiers (Basic / Pro / Enterprise)
- **Public leaderboard** (optional) — showcase top creators

## Main Features (MVP – 2026)

- Upload long video or paste YouTube/TikTok link
- AI creates 50–200 short clips (15–60 seconds each)
- Preview screen: watch short previews, select / deselect / bulk delete
- One-click post selected clips to multiple platforms
- Earnings dashboard (shows money from all platforms)
- Optional: mint selected clips as NFTs on Stellar (Soroban smart contracts)
- Subscription plans + small revenue share (we take 5–10% only if you want)

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     Frontend (Next.js + React)                  │
│              - Video upload / YouTube import UI                 │
│              - Clip preview & selection                         │
│              - Multi-platform posting dashboard                 │
│              - Wallet integration & NFT mint                    │
└─────────────────────┬───────────────────────────────────────────┘
                      │ HTTP/WebSocket
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│              Backend API (NestJS + TypeScript)                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Controllers:                                             │  │
│  │ - Auth (login, signup, social OAuth)                    │  │
│  │ - Videos (upload, list, detect viral moments)           │  │
│  │ - Clips (preview, select, post, mint as NFT)            │  │
│  │ - Wallets (connect Stellar)                             │  │
│  │ - Earnings & Payouts (track, payout to users)           │  │
│  │ - Queue Dashboard (inspect/retry failed jobs)           │  │
│  └──────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Services:                                                │  │
│  │ - VideoService (AI detection via Claude, FFmpeg)        │  │
│  │ - ClipsService (CRUD, filter, generate)                 │  │
│  │ - SocialService (Ayrshare integration)                   │  │
│  │ - NftMintService (Soroban contract calls)                │  │
│  │ - PayoutService (Stellar XLM transfers)                  │  │
│  │ - PrismaService (database abstraction)                   │  │
│  │ - JWTService (authentication & tokens)                   │  │
│  └──────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Job Queues (BullMQ + Redis):                             │  │
│  │ - clip-generation (FFmpeg → Cloudinary)                  │  │
│  │ - clip-posting (post to TikTok, Instagram, etc.)         │  │
│  │ - nft-mint (Soroban contract interaction)                │  │
│  │ - email-delivery (transactional emails)                  │  │
│  │ - payout-retry (Stellar payments)                        │  │
│  │ - anomaly-detection (fraud detection)                    │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────┬───────────────────────────────────────────┘
                      │
         ┌────────────┼────────────┬──────────────┐
         │            │            │              │
         ▼            ▼            ▼              ▼
    ┌────────┐  ┌────────┐  ┌──────────┐  ┌───────────┐
    │ Redis  │  │   DB   │  │ External │  │ Blockchain
    │(BullMQ)│  │(Postgres)  │Services  │  │(Stellar)
    │(Cache) │  │        │  │          │  │
    └────────┘  └────────┘  └──────────┘  └───────────┘
                                 │
            ┌────────────────────┼────────────────────┐
            │                    │                    │
            ▼                    ▼                    ▼
       ┌─────────┐          ┌─────────┐          ┌──────────┐
       │Ayrshare │          │Cloudinary          │Pinata
       │(Social  │          │(CDN for            │(IPFS for
       │Posting) │          │clips/thumbnails)   │metadata)
       └─────────┘          └─────────┘          └──────────┘
            │
    ┌───────┴───────┬────────────┬──────────┬─────────┐
    │               │            │          │         │
    ▼               ▼            ▼          ▼         ▼
┌────────┐   ┌────────────┐ ┌──────┐ ┌──────┐ ┌──────────┐
│TikTok  │   │Instagram   │ │YouTube│ │Twitter│ │Facebook
│Reels   │   │Reels       │ │Shorts │ │       │ │Reels
└────────┘   └────────────┘ └──────┘ └──────┘ └──────────┘
```

## Tech Stack – Complete Reference

### Core Platform

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Frontend** | Next.js 15, React 19, TypeScript, Tailwind CSS | Modern, responsive UI with SSR |
| **Backend** | NestJS, TypeScript, Node.js 18+ | Type-safe, modular API server |
| **Database** | PostgreSQL 14+, Prisma ORM | ACID compliance, schema migrations |
| **Caching** | Redis 7+ | Session storage, rate limiting, queue backing |

### Async Job Processing

| Component | Technology | Purpose |
|-----------|-----------|---------|
| **Job Queue** | BullMQ | Queue manager with retries and scheduling |
| **Backing Store** | Redis | Persistent job storage and locking |
| **Processors** | TypeScript classes | Workers that execute queued jobs |

### External Services & APIs

| Service | Purpose | Key Feature |
|---------|---------|------------|
| **Claude / Anthropic SDK** | Analyze videos, detect viral moments | Vision analysis + JSON parsing |
| **Ayrshare** | Post clips to multiple platforms | Single API for 10+ social networks |
| **Cloudinary** | Video hosting, CDN, thumbnails | Automatic format conversion |
| **Pinata** | IPFS storage for NFT metadata | Decentralized metadata hosting |
| **Stellar Soroban RPC** | Blockchain smart contract calls | NFT minting, XLM transfers |
| **Freighter / Albedo** | Web3 wallet integration | User-controlled key signing |

### Smart Contracts & Blockchain

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Blockchain** | Stellar Public Network | Low-fee transactions |
| **Contract Lang** | Soroban (Rust) | Smart contracts for NFT minting |
| **Token Standard** | Stellar Native XLM | User payouts in XLM |
| **NFT Implementation** | Soroban contract | Customizable royalties & metadata |

## Getting Started

### Prerequisites

- Node.js 18+
- npm 9+
- Git
- Docker and Docker Compose (optional, recommended for PostgreSQL and Redis)

### Clone the repository

```bash
git clone https://github.com/devpragya8081/clips-backend.git
cd clips-backend
```

Add the upstream remote if you are contributing:

```bash
git remote add upstream https://github.com/ANYTECHS/clips-backend.git
```

### Setup with Docker (recommended)

Start PostgreSQL and Redis:

```bash
docker compose up -d
```

Copy environment defaults and set `DATABASE_URL` to match Docker:

```bash
cp .env.example .env
```

Use this `DATABASE_URL` when running the compose file above:

```env
DATABASE_URL="postgresql://postgres:password@localhost:5432/clipscash?schema=public"
REDIS_HOST=localhost
REDIS_PORT=6379
```

Install dependencies, run migrations, and start the API:

```bash
npm install
npx prisma migrate dev
npm run start:dev
```

API: <http://localhost:3000>  
Swagger (development): <http://localhost:3000/api/docs>

### Manual setup (without Docker)

1. Install and run **PostgreSQL 14+** and create a database (e.g. `clipscash`).
2. Install and run **Redis 7+** on `localhost:6379`.
3. Copy `.env.example` to `.env` and set `DATABASE_URL`, `REDIS_HOST`, and `JWT_SECRET`.
4. Run `npm install`, `npx prisma migrate dev`, and `npm run start:dev`.

### Useful commands

| Command | Description |
| ------- | ----------- |
| `npm run start:dev` | Start API with hot reload |
| `npm test` | Unit tests |
| `npm run test:e2e` | End-to-end tests |
| `npm run lint` | ESLint |
| `npx prisma studio` | Browse database |

### Troubleshooting

| Problem | What to check |
| ------- | ------------- |
| `Can't reach database server` | PostgreSQL is running; `DATABASE_URL` host/port/user/password match your instance |
| Redis / BullMQ connection errors | Redis is running; `REDIS_HOST` and `REDIS_PORT` in `.env` |
| `SOROBAN_NFT_CONTRACT_ID` errors on NFT routes | Set a deployed testnet contract ID or avoid NFT endpoints until configured |
| Prisma migration failures | Database exists and credentials are correct; try `npx prisma migrate reset` only on a local dev DB |
| Port 3000 already in use | Stop the other process or set `PORT` in `.env` |
| JWT / 401 on protected routes | Obtain a token via auth endpoints; send `Authorization: Bearer <token>` |

Stellar-specific integration (wallets, mint, royalties) is documented in [docs/stellar-integration.md](./docs/stellar-integration.md).

## API Documentation (Swagger/OpenAPI)

ClipCash provides comprehensive API documentation via Swagger UI.

### Accessing the Docs

When running in **development mode** (`NODE_ENV !== 'production'`):

- **Swagger UI**: <http://localhost:3000/api/docs>
- **OpenAPI JSON**: <http://localhost:3000/api/docs-json> (or `openapi.json` file)
- **Rate Limits**: See [docs/rate-limits.md](./docs/rate-limits.md) for detailed rate limiting documentation
- **Error Codes**: See [docs/error-codes.md](./docs/error-codes.md) for API error code definitions and handling

### Authentication

Most endpoints require a Bearer token. To authenticate in Swagger UI:

1. Click the **Authorize** button (🔓) at the top of the page
2. Enter your JWT token: `Bearer your_token_here`
3. Click **Authorize** and close the dialog
4. All subsequent requests will include the token automatically

### Exporting OpenAPI Spec

To export the OpenAPI JSON spec for external use:

```bash
# During development (automatically exported on start)
npm run start:dev

# Or manually export
npm run openapi:export
```

This creates `openapi.json` in the project root, which can be used with:
- Postman (Import → File)
- Insomnia
- Code generators (OpenAPI Generator)
- Frontend client SDKs

### Environment Variables for Swagger

```env
# Disable Swagger UI in production (default: true in prod)
ENABLE_SWAGGER_UI=false

# Or enable it even in production (not recommended for public APIs)
ENABLE_SWAGGER_UI=true
```

## Environment Variables

Copy `.env.example` to `.env` and fill in the values:

```bash
cp .env.example .env
```

### Key Variables Reference

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `ENCRYPTION_SECRET` | ✅ | Min 32-char secret for encrypting sensitive data |
| `JWT_SECRET` | ✅ | Secret for signing JWT access tokens |
| `REDIS_HOST` / `REDIS_PORT` | ✅ | Redis connection (used by BullMQ and rate limiting) |
| `STELLAR_NETWORK` | ✅ | `testnet` (dev) or `public` (production) |
| `SOROBAN_NFT_CONTRACT_ID` | ✅ | Deployed Soroban NFT contract ID |
| `CLOUDINARY_CLOUD_NAME` | ✅ | Cloudinary cloud name for video/thumbnail CDN |
| `CLOUDINARY_API_KEY` | ✅ | Cloudinary API key |
| `CLOUDINARY_API_SECRET` | ✅ | Cloudinary API secret |
| `AYRSHARE_API_KEY` | ✅ | Ayrshare key for multi-platform social posting |
| `PINATA_JWT` | ✅ | Pinata JWT for uploading NFT metadata to IPFS |
| `WEBHOOK_SECRET` | ✅ | HMAC-SHA256 secret for Stellar payment webhooks |
| `METRICS_TOKEN` | ✅ | Bearer token protecting the `/metrics` endpoint |
| `BULLMQ_CLIP_GENERATION_CONCURRENCY` | — | Parallel clip jobs (default: `2`) |
| `BULLMQ_EMAIL_DELIVERY_CONCURRENCY` | — | Parallel email jobs (default: `5`) |
| `MIN_PAYOUT_USD` / `MAX_PAYOUT_USD` | — | Payout limits in USD (default: `5` / `10000`) |
| `LEADERBOARD_ENABLED` | — | Enable public earnings leaderboard (default: `false`) |

For detailed BullMQ concurrency tuning, see [BULLMQ_WORKER_SCALING.md](./BULLMQ_WORKER_SCALING.md).

## Stellar Network Configuration

The backend supports switching between Stellar **testnet** and **mainnet** (public network) via an environment variable.

### `STELLAR_NETWORK`

| Value      | Network                | RPC URL                                  | Use when               |
| ---------- | ---------------------- | ---------------------------------------- | ---------------------- |
| `testnet`  | Stellar Testnet (SDF)  | `https://soroban-testnet.stellar.org`    | Development / staging  |
| `public`   | Stellar Mainnet        | `https://soroban-rpc.stellar.org`        | Production             |

**Default:** `testnet`

Set in your `.env`:

```env
# Development
STELLAR_NETWORK=testnet

# Production
STELLAR_NETWORK=public
```

The `StellarService` reads this variable at startup and exposes the correct `rpcUrl` and `networkPassphrase` to all services that perform Stellar operations (minting, payouts).

### `MIN_STELLAR_PAYOUT`

Minimum payout amount in USD equivalent. Requests below this threshold are rejected with a `400` error to prevent fee-wasting micro-transactions.

```env
MIN_STELLAR_PAYOUT=5   # default: 5 USD
```

## API Endpoints

### Metrics — `GET /metrics`

Prometheus-compatible metrics are exposed at `/metrics` and protected with `METRICS_TOKEN`.

- Send header: `x-metrics-token: <METRICS_TOKEN>`
- This route is not guarded by JWT, but returns `403` when token is missing/invalid.

Tracked metrics:

- `clipcash_clips_generated_total{status="success|failure"}`
- `clipcash_nft_mints_total{status="success|failure"}`
- `clipcash_job_queue_depth{queue="clip-generation"}`
- `clipcash_http_request_duration_seconds{method,route,status_code}`
- `clipcash_stellar_rpc_errors_total`
- `clipcash_cloudinary_upload_errors_total`

### Wallets — `GET /wallets`

Wallet addresses are **partially masked** in all responses for user privacy. Only the last 6 characters of the address are shown (e.g. `******KPRQ6A`).

| Method | Endpoint        | Description                   |
| ------ | --------------- | ----------------------------- |
| GET    | `/wallets`      | List current user's wallets   |
| GET    | `/wallets/:id`  | Get a single wallet by ID     |

### Mint — `POST /clips/:id/mint`

Mint a clip as an NFT on Stellar. Clips that have already been **auto-posted** (`postStatus = "posted"`) cannot be minted and will return `400`.

| Method | Endpoint            | Description         |
| ------ | ------------------- | ------------------- |
| POST   | `/clips/:id/mint`   | Mint clip as NFT    |

### Payouts — `POST /payouts`

Initiate a Stellar payout. Returns `400` if the amount is below `MIN_STELLAR_PAYOUT`.

| Method | Endpoint    | Body                         | Description             |
| ------ | ----------- | ---------------------------- | ----------------------- |
| POST   | `/payouts`  | `{ amount, walletId? }`      | Initiate Stellar payout |

## Project Structure

```text
clips-backend/
├── src/
│   ├── auth/        # JWT, Google OAuth, magic links
│   ├── clips/       # Clip generation & management
│   ├── videos/      # Video upload & processing
│   ├── wallet/      # Wallet listing with masked addresses
│   ├── mint/        # NFT minting (Stellar Soroban)
│   ├── payout/      # Stellar payouts with minimum threshold
│   ├── stellar/     # Stellar SDK configuration (network switching)
│   ├── jobs/        # BullMQ job management
│   ├── earnings/    # Earnings dashboard
│   └── prisma/      # Database connection
├── prisma/
│   └── schema.prisma
└── .env.example
```

## Integration and E2E Tests

Run the subscription integration flow and existing e2e suites with:

```bash
npm run test:e2e
```

The subscription integration scenarios live in `test/subscription-flow.e2e-spec.ts` and cover:

- intent creation with memo and destination
- activation on matching memo+amount
- rejection on wrong amount
- idempotency on duplicate transaction id
- rejection of expired intents (>15 minutes)
