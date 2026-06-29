# ClipCash Architecture Overview

This document gives new contributors a high-level map of how ClipCash works — from video upload through clip generation, NFT minting, and Stellar payouts.

---

## System Diagram

```
┌─────────────────────────────────────────────────────────┐
│                      Frontend (Next.js)                  │
│  Video Upload │ Clip Preview │ Wallet Connect │ Dashboard│
└──────────────────────────┬──────────────────────────────┘
                           │ HTTPS / WebSocket
┌──────────────────────────▼──────────────────────────────┐
│                  NestJS Backend (this repo)              │
│                                                          │
│  REST API  ──►  Services  ──►  BullMQ Queues             │
│                    │                  │                  │
│               Prisma ORM         Workers (async)         │
│                    │                  │                  │
│              PostgreSQL          Cloudinary / FFmpeg      │
└──────┬─────────────────────────────────────┬────────────┘
       │                                     │
       │ Stellar SDK                         │ Redis
┌──────▼──────────────┐           ┌──────────▼───────────┐
│  Stellar Network    │           │  Redis               │
│  (Testnet/Mainnet)  │           │  - BullMQ queues     │
│  - XLM / USDC       │           │  - Rate limiting     │
│  - Soroban contracts│           │  - Caching           │
└─────────────────────┘           └──────────────────────┘
```

---

## Core Flows

### 1. Video → Clip → Post

```
POST /videos/upload
  └─► VideoUploadService  (validates, stores to Cloudinary)
        └─► POST /clips/generate
              └─► QueueRateLimitGuard  (Redis counter per user)
                    └─► clip-generation queue (BullMQ)
                          └─► ClipGenerationProcessor
                                ├─► FFmpeg  (trim, caption, watermark)
                                ├─► Cloudinary  (upload output)
                                ├─► DB update  (clip.status = READY)
                                └─► WebSocket event → frontend
                                      └─► POST /clips/:id/post
                                            └─► clip-posting queue
                                                  └─► Ayrshare API
```

### 2. Clip → NFT Mint

```
POST /nfts/prepare-mint
  └─► NftMintService.prepareMintTx()
        └─► Soroban RPC  (build XDR transaction)
              └─► XDR returned to frontend for signing
                    └─► User signs with Freighter wallet
                          └─► POST /clips/:id/mint/confirm
                                └─► DB update  (clip.nftMintAddress set)
```

### 3. Earnings → Payout

```
Clip views / subscriptions
  └─► EarningsService  (records earnings per clip)
        └─► POST /payouts/request
              └─► PayoutsService
                    ├─► Checks minimum balance (MIN_STELLAR_PAYOUT)
                    ├─► FeeService  (calculates platform fee)
                    ├─► Creates Payout record (status: pending)
                    └─► Admin approves → POST /admin/payouts/:id/approve
                          └─► StellarService.sendPayment()
                                └─► XLM/USDC transfer on Stellar network
                                      └─► PayoutReceiptService  (email receipt)
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 20, TypeScript |
| Framework | NestJS |
| Database | PostgreSQL via Prisma ORM |
| Queue / Jobs | BullMQ + Redis |
| Video processing | FFmpeg (via `fluent-ffmpeg`) |
| Media storage | Cloudinary |
| Blockchain | Stellar (XLM / USDC), Soroban smart contracts |
| Wallet support | Freighter, Lobstr, Albedo |
| Auth | JWT (httpOnly cookies) + magic-link email |
| Email | Nodemailer (SMTP) via email-delivery queue |
| Social posting | Ayrshare API |
| Observability | Prometheus metrics at `/metrics` |
| API docs | Swagger UI at `/api/docs` |

---

## Folder Structure

```
src/
├── auth/           # JWT auth, magic links, email delivery queue
├── clips/          # Clip generation, posting, NFT mint processors & services
├── common/         # Shared guards, exceptions, circuit breaker, throttler
├── config/         # BullMQ config, environment validation
├── earnings/       # Earnings tracking, anomaly detection, CSV export
├── encryption/     # AES encryption for sensitive fields (platform tokens)
├── health/         # Health check endpoint, Redis memory monitor
├── jobs/           # Job management endpoints (retry, list failed)
├── logger/         # Structured logger, request-id middleware
├── metrics/        # Prometheus metrics service and interceptor
├── nft/            # NFT service, royalty queries, batch royalty, platform revenue
├── payouts/        # Payout request, processing, fee calc, payout methods
├── prisma/         # PrismaService (DB client)
├── redis/          # RedisService wrapper
├── stellar/        # Stellar SDK service, payment listener
├── subscriptions/  # Subscription plans, Stellar webhook handler
├── transactions/   # On-chain transaction records
├── users/          # User profile management
├── videos/         # Video upload, validation
├── wallets/        # Wallet connect/disconnect, ownership guard
├── webhooks/       # Outbound webhook delivery
├── user-platform/  # Social platform OAuth token management
├── app.module.ts
└── main.ts         # Bootstrap, Swagger setup, graceful shutdown

contracts/
└── nft-royalty/    # Soroban Rust smart contract for NFT royalties

prisma/
├── schema.prisma   # Database schema
└── migrations/     # Migration history

docs/
├── architecture.md         # This file
└── queue-architecture.md   # BullMQ queue details
```

---

## Key Design Decisions

**BullMQ for all async work** — Video processing and NFT minting are slow and failure-prone. Queues decouple HTTP responses from heavy work, enable retries, and allow horizontal scaling by running multiple worker processes.

**Separate queues per concern** — `clip-generation`, `nft-mint`, `email-delivery`, and `payout-retry` are isolated so a Soroban RPC outage doesn't block video processing.

**Stellar for payments** — XLM and USDC on Stellar provide fast, low-fee cross-border payouts. Soroban contracts handle NFT royalty splits on-chain.

**httpOnly JWT cookies** — Tokens are stored in httpOnly cookies (not localStorage) to prevent XSS token theft. CSRF protection is applied to mutating endpoints.

**Prisma ORM** — Type-safe DB access with migration history. Critical multi-step operations (earnings + payout creation) use `$transaction` to ensure atomicity.

---

## Local Development

```bash
# 1. Install dependencies
npm install

# 2. Start Redis (required for queues and caching)
docker run -p 6379:6379 redis:7-alpine

# 3. Set up environment
cp .env.example .env
# Edit .env with your DB URL, Stellar keys, etc.

# 4. Run migrations
npx prisma migrate dev

# 5. Start the server
npm run start:dev
# API: http://localhost:3000
# Swagger: http://localhost:3000/api/docs
```

See [CONTRIBUTING.md](../CONTRIBUTING.md) for the full contributor guide.
