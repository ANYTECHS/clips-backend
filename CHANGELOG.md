# Changelog

All notable changes to the ClipCash backend project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Guiding Principles

- **Human-Readable:** Changelog entries are written for humans, not machine git logs.
- **Categorized:** Changes in each release are grouped by type:
  - `Added` for new features and non-breaking capabilities.
  - `Changed` for changes in existing functionality.
  - `Deprecated` for soon-to-be removed features.
  - `Removed` for now removed features.
  - `Fixed` for bug fixes.
  - `Security` in case of vulnerabilities.
  - `Breaking` for backward-incompatible modifications requiring consumer migration.
- **SemVer Mapping:**
  - `MAJOR` version bumps indicate breaking changes (`Breaking`).
  - `MINOR` version bumps indicate backward-compatible feature additions (`Added`).
  - `PATCH` version bumps indicate backward-compatible bug fixes (`Fixed`, `Security`).

---

## [Unreleased]

### Added

- **Soroban Fee Estimation Helper:** Implemented `estimate_mint_fee()` and `estimate_transfer_fee()` to simulate contract calls and return approximate transaction costs in stroops and XLM before signing.
- **Fee Estimation Endpoints:** Added `GET /soroban/fees/mint` and `GET /soroban/fees/transfer` with query filters and comprehensive Swagger documentation.
- **Versioning & Changelog Architecture:** Added standardized `CHANGELOG.md` and comprehensive versioning guidelines in `docs/versioning.md`.

### Changed

- Standardized release and versioning documentation to define explicit SemVer guidelines, breaking change deprecation schedules, and OpenAPI synchronization workflows.

### Fixed

- Fixed unhandled edge cases in background queue processors and circuit breaker resilience policies.

---

## [1.0.0] - 2026-10-20

### Added

- **Core Architecture:** NestJS 11 backend with modular domain architecture, BullMQ job queues, and Prisma ORM repository patterns.
- **Authentication & Authorization:**
  - JWT Bearer authentication paired with optional httpOnly, SameSite=Strict cookies.
  - Double-submit cookie CSRF protection (`X-CSRF-Token` header validation).
  - Role-based access control (Admin, Creator, User).
  - Two-Factor Authentication (2FA) and email verification delivery.
- **Videos & AI Clip Generation:**
  - Video upload, transcoding metadata extraction via FFmpeg, and Cloudinary asset management.
  - AI moment detection and chunk splitting.
  - Multi-platform publishing queues supporting TikTok, Instagram Reels, YouTube Shorts, Facebook, and LinkedIn.
- **Stellar & Soroban Integration:**
  - Non-Fungible Token (NFT) minting and batch minting via Soroban smart contracts.
  - ERC-2981 compliant secondary market royalty calculations and on-chain royalty claims.
  - Wallet balance retrieval, address validation, and Horizon network switching (`testnet` and `public`).
  - Real-time Soroban event listening and indexing.
- **Payouts & Financial Operations:**
  - Creator earnings aggregation and tax report export services.
  - Automated Stellar payout verification and retry worker queues.
  - Minimum payout threshold validation and per-currency limits.
- **Resilience & Monitoring:**
  - Circuit Breaker pattern implementation for external RPC and Horizon network calls.
  - Prometheus metrics endpoint (`/metrics`) and request correlation tracing via `X-Request-Id`.
- **API Documentation:**
  - Interactive Swagger UI documentation served at `/api/docs`.
  - Automated OpenAPI schema export to `openapi.json`.

### Security

- Added Helmet security header policies (CSP lockdown, HSTS, noSniff, frameguard).
- Implemented multi-tier rate limiting (Throttler) covering auth, clip generation, and blockchain transaction endpoints.
- Database field encryption for sensitive OAuth tokens, platform secrets, and payment credentials.

---

## [0.9.0] - 2026-09-15

### Added

- Initial MVP release of video ingestion and clip generation.
- Basic user authentication and wallet connection.
- Prototype Stellar transaction submission via Horizon.

[Unreleased]: https://github.com/ANYTECHS/clips-backend/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/ANYTECHS/clips-backend/compare/v0.9.0...v1.0.0
[0.9.0]: https://github.com/ANYTECHS/clips-backend/releases/tag/v0.9.0
