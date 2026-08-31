# ClipCash — API Contract Reference

This document is the authoritative reference for the ClipCash REST API. It covers authentication, major endpoints, request/response shapes, error codes, and worked examples for common workflows (clip curation and NFT minting).

> **Live interactive docs:** When running in development mode, Swagger UI is available at [`http://localhost:3000/api/docs`](http://localhost:3000/api/docs). In production see [docs/deployment.md](./deployment.md#swagger--api-documentation-in-production) for enabling Swagger.

---

## Table of Contents

1. [Base URL & Versioning](#base-url--versioning)
2. [Authentication](#authentication)
3. [Common Headers](#common-headers)
4. [Common Error Responses](#common-error-responses)
5. [Endpoints](#endpoints)
   - [Auth](#auth)
   - [Users](#users)
   - [Videos](#videos)
   - [Clips](#clips)
   - [Wallets](#wallets)
   - [Earnings](#earnings)
   - [Payouts](#payouts)
   - [NFT / Mint](#nft--mint)
   - [Subscriptions](#subscriptions)
   - [Health & Metrics](#health--metrics)
6. [Workflows](#workflows)
   - [Clip Curation](#clip-curation-workflow)
   - [NFT Minting](#nft-minting-workflow)
7. [Pagination](#pagination)
8. [API Versioning](#api-versioning)

---

## Base URL & Versioning

| Environment | Base URL |
|---|---|
| Local development | `http://localhost:3000` |
| Production | `https://api.clipcash.app` (example) |

The API does **not** currently use URL versioning (e.g. `/v1/`). All endpoints are served from the root path.

---

## Authentication

Most endpoints require a JWT Bearer token. Obtain one via `POST /auth/login` or `POST /auth/signup`.

### Sending the Token

```http
Authorization: Bearer <access_token>
```

### Token Lifecycle

| Property | Value |
|---|---|
| Access token TTL | Configurable via `JWT_EXPIRES` (default: 3600 s) |
| Refresh token TTL | Configurable via `JWT_REFRESH_EXPIRES_DAYS` (default: 14 days) |

Use `POST /auth/refresh` with the refresh token to obtain a new access token without re-authenticating.

### Authenticating in Swagger UI

1. Click the **Authorize** button (🔓) at the top of the Swagger UI page.
2. Enter `Bearer <your_token>` in the `access-token` (http, Bearer) field.
3. Click **Authorize** and close the dialog.

---

## Common Headers

| Header | Required | Description |
|---|---|---|
| `Authorization` | Yes (protected routes) | `Bearer <jwt_access_token>` |
| `Content-Type` | Yes (POST/PATCH) | `application/json` |
| `x-metrics-token` | Yes (`GET /metrics`) | Prometheus metrics token |

---

## Common Error Responses

All error responses follow this schema:

```json
{
  "statusCode": 400,
  "message": "Validation error description",
  "error": "Bad Request"
}
```

| HTTP Status | Meaning |
|---|---|
| `400 Bad Request` | Invalid request body or query parameters |
| `401 Unauthorized` | Missing or invalid JWT token |
| `403 Forbidden` | Authenticated but insufficient role/permission |
| `404 Not Found` | Resource does not exist |
| `409 Conflict` | Duplicate resource or conflicting state |
| `422 Unprocessable Entity` | Validation failed on specific fields |
| `429 Too Many Requests` | Rate limit exceeded |
| `500 Internal Server Error` | Unexpected server error |

---

## Endpoints

### Auth

All auth endpoints are **public** (no JWT required) unless noted.

#### `POST /auth/signup`

Register a new user with email and password.

**Request body:**

```json
{
  "email": "user@example.com",
  "password": "StrongP@ssw0rd!",
  "name": "Jane Doe"
}
```

**Response `201`:**

```json
{
  "accessToken": "eyJhbGci...",
  "refreshToken": "eyJhbGci...",
  "user": {
    "id": 1,
    "email": "user@example.com",
    "name": "Jane Doe"
  }
}
```

---

#### `POST /auth/login`

**Request body:**

```json
{
  "email": "user@example.com",
  "password": "StrongP@ssw0rd!"
}
```

**Response `200`:**

```json
{
  "accessToken": "eyJhbGci...",
  "refreshToken": "eyJhbGci..."
}
```

---

#### `POST /auth/refresh`

Exchange a refresh token for a new access token.

**Request body:**

```json
{ "refreshToken": "eyJhbGci..." }
```

**Response `200`:**

```json
{ "accessToken": "eyJhbGci..." }
```

---

#### `POST /auth/logout`

Revoke the current refresh token. Requires `Authorization` header.

**Response `200`:** `{ "message": "Logged out successfully" }`

---

#### `POST /auth/forgot-password`

Send a password-reset email.

**Request body:** `{ "email": "user@example.com" }`

**Response `200`:** `{ "message": "Password reset email sent" }`

---

#### `POST /auth/reset-password`

**Request body:**

```json
{
  "token": "<reset-token-from-email>",
  "password": "NewP@ssw0rd!"
}
```

**Response `200`:** `{ "message": "Password updated successfully" }`

---

### Users

All user endpoints require `Authorization: Bearer <token>`.

#### `GET /users/me`

Returns the authenticated user's profile, including a masked `stellarPublicKey`.

**Response `200`:**

```json
{
  "id": 1,
  "email": "user@example.com",
  "name": "Jane Doe",
  "role": "user",
  "stellarPublicKey": "GC6X****UTZF3",
  "walletType": "custodial",
  "showOnLeaderboard": false
}
```

---

#### `POST /users/wallet/create`

Generate a custodial Stellar wallet for the authenticated user.

**Response `200`:**

```json
{
  "stellarPublicKey": "GC6X****UTZF3",
  "walletType": "custodial"
}
```

**Response `409`:** Wallet already exists.

---

### Videos

All video endpoints require `Authorization: Bearer <token>`.

#### `GET /videos`

List videos for the authenticated user.

**Response `200`:** Array of video objects.

---

#### `POST /videos/:id/cancel`

Cancel ongoing clip generation for a video.

**Path params:** `id` — Video ID (integer)

**Response `200`:** `{ "message": "Video <id> processing has been cancelled" }`

**Response `400`:** Video not in `pending` or `processing` state.

**Response `404`:** Video not found.

---

### Clips

All clip endpoints require `Authorization: Bearer <token>`.

#### `GET /clips`

List clips with pagination and optional filtering.

**Query parameters:**

| Param | Type | Default | Description |
|---|---|---|---|
| `videoId` | integer (string) | — | Filter to a specific source video |
| `page` | integer | `1` | Page number (1-based) |
| `limit` | integer | `20` | Results per page (1–100) |
| `sortBy` | string | `createdAt` | `viralityScore` \| `createdAt` \| `duration` |
| `order` | string | `desc` | `asc` \| `desc` |

**Response `200`:**

```json
{
  "data": [
    {
      "id": 42,
      "videoId": 7,
      "clipUrl": "https://res.cloudinary.com/demo/video/upload/clip-42.mp4",
      "thumbnail": "https://res.cloudinary.com/demo/image/upload/clip-42-thumb.jpg",
      "title": "Epic moment",
      "caption": "#viral #shorts",
      "startTime": 12.5,
      "endTime": 42.0,
      "duration": 29.5,
      "viralityScore": 0.87,
      "royaltyBps": 1000,
      "selected": false,
      "postStatus": null,
      "nftStatus": "none",
      "status": "ready",
      "createdAt": "2026-08-28T12:00:00.000Z",
      "updatedAt": "2026-08-28T12:00:00.000Z"
    }
  ],
  "meta": {
    "total": 47,
    "page": 1,
    "limit": 20,
    "totalPages": 3
  }
}
```

---

#### `GET /clips/:id`

Fetch a single clip by ID.

**Response `200`:** Single clip object (same shape as list items).

**Response `404`:** Clip not found.

---

#### `POST /clips/generate`

Enqueue a clip generation job.

**Request body:**

```json
{
  "videoId": "7",
  "platforms": ["tiktok", "instagram"]
}
```

**Response `201`:** `{ "jobId": "abc123", "message": "Clip generation queued" }`

**Response `429`:** Too many active jobs (max 5 per user).

---

#### `POST /clips/bulk-update`

Bulk update `selected`, `postStatus`, `caption`, or `royaltyBps` for multiple clips.

**Request body:**

```json
{
  "clipIds": [1, 2, 3],
  "updates": {
    "selected": true
  }
}
```

**Response `200`:**

```json
{
  "updatedCount": 3,
  "notFoundIds": []
}
```

---

#### `POST /clips/bulk-delete`

Delete multiple clips (and their Cloudinary assets) owned by the authenticated user.

**Request body:**

```json
{ "clipIds": [4, 5, 6] }
```

**Response `200`:**

```json
{
  "deleted": 3,
  "skipped": 0,
  "skippedIds": []
}
```

**Response `403`:** None of the clips belong to the requesting user.

---

#### `POST /clips/:id/regenerate`

Re-run FFmpeg for a clip using its original timestamps and upload a new version to Cloudinary.

**Response `200`:** Updated clip object with new `clipUrl` and `thumbnail`.

---

#### `PATCH /clips/:id/caption`

Update a clip's caption.

**Request body:** `{ "caption": "#viral #gaming" }`

**Response `200`:** Updated clip object.

---

#### `PATCH /clips/:id/royalty`

Set the NFT royalty in basis points (BPS) for a clip. Range: 0–1500 (0–15%). Default: 1000 (10%).

**Request body:**

```json
{ "royaltyBps": 750 }
```

**Response `200`:**

```json
{ "id": 42, "royaltyBps": 750 }
```

**Response `400`:** `royaltyBps` out of range.

**Response `403`:** Clip not owned by the requesting user.

---

### Wallets

All wallet endpoints require `Authorization: Bearer <token>`.

> Wallet addresses are **partially masked** in all responses (e.g. `******KPRQ6A`).

#### `GET /wallets`

List all wallets for the authenticated user.

**Response `200`:**

```json
[
  {
    "id": 1,
    "address": "******KPRQ6A",
    "chain": "stellar",
    "type": "freighter",
    "connectedAt": "2026-08-01T10:00:00.000Z"
  }
]
```

---

#### `GET /wallets/:id`

Get a single wallet by ID.

**Response `200`:** Single wallet object.

**Response `404`:** Wallet not found or belongs to another user.

---

#### `GET /wallets/:id/balance`

Get the current XLM balance for a wallet.

**Response `200`:**

```json
{
  "balance": 5.2,
  "warning": false
}
```

`warning: true` when balance is below the 2 XLM threshold required for NFT minting.

---

#### `POST /wallets/connect`

Connect a new wallet.

**Request body:**

```json
{
  "address": "GC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3",
  "chain": "stellar",
  "type": "freighter",
  "signature": "<signed-challenge>"
}
```

**Response `200`:** Connected wallet object.

---

#### `DELETE /wallets/:id`

Disconnect (soft-delete) a wallet. Blocked if active NFTs or pending payouts exist.

**Response `200`:** `{ "message": "Wallet disconnected successfully", "walletId": 1 }`

**Response `409`:** Wallet has pending payouts or active NFTs.

---

#### `GET /wallets/:address/nfts`

List NFT token IDs owned by a Stellar wallet address. Public endpoint — no auth required.

**Query parameters:** `page` (default: 1), `limit` (default: 20, max: 100)

**Response `200`:**

```json
{
  "address": "GC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3",
  "tokenIds": [42, 51, 99],
  "total": 3,
  "page": 1,
  "limit": 20,
  "hasNextPage": false
}
```

---

### Earnings

#### `GET /earnings` 🔒

Get the authenticated user's earnings with optional date filtering.

**Query parameters:** `startDate` (ISO 8601), `endDate` (ISO 8601)

**Response `200`:** Array of earning records with clip titles.

---

#### `GET /earnings/aggregate` 🔒

Get aggregated earnings totals.

**Response `200`:**

```json
{
  "totalAmount": 1500.00,
  "totalAmountInBaseCurrency": 1500.00,
  "baseCurrency": "USD",
  "count": 42
}
```

---

#### `GET /earnings/leaderboard`

Public leaderboard of top earning creators who have opted in.

**Query parameters:** `limit` (default: 100, max: 500)

**Response `200`:**

```json
{
  "data": [
    { "rank": 1, "userId": 123, "username": "creator123", "totalEarnings": 5000 }
  ],
  "updatedAt": "2026-08-28T00:00:00.000Z"
}
```

---

#### `GET /earnings/leaderboard/rank` 🔒

Get the authenticated user's leaderboard rank.

**Response `200`:**

```json
{
  "rank": 5,
  "totalEarnings": 2500,
  "showOnLeaderboard": true
}
```

---

#### `POST /earnings/leaderboard/visibility` 🔒

Toggle leaderboard visibility for the authenticated user.

**Request body:** `{ "showOnLeaderboard": true }`

**Response `200`:** `{ "showOnLeaderboard": true }`

---

### Payouts

All payout endpoints require `Authorization: Bearer <token>`.

#### `GET /payouts/balance`

Get available balance for payout. Formula: `totalEarned - totalPaidOut - totalPending`.

**Response `200`:**

```json
{
  "available": 350.00,
  "currency": "USD"
}
```

---

#### `POST /payouts/request`

Request a payout.

**Request body:**

```json
{
  "amount": 100.00,
  "currency": "USD",
  "method": "stellar",
  "walletId": 1
}
```

**Response `201`:** Created payout object.

**Response `400`:** Amount below minimum (`MIN_PAYOUT_USD`) or exceeds available balance.

---

#### `POST /payouts/initiate-stellar`

Prepare a Stellar XDR transaction for signing.

**Request body:**

```json
{
  "payoutId": 5,
  "amount": 100.00
}
```

**Response `200`:**

```json
{
  "id": 5,
  "status": "pending",
  "amount": 100.00,
  "transactionId": "tx_...",
  "stellarXdr": "AAAAAQAA..."
}
```

**Response `400`:** Payout not in approvable state or amount mismatch.

---

#### `GET /payouts/:id/receipt`

Download a payout receipt PDF (only available for completed payouts).

**Response `200`:** PDF file stream (`application/pdf`).

**Response `400`:** Payout not completed.

**Response `404`:** Payout or receipt not found.

---

### NFT / Mint

All mint endpoints require `Authorization: Bearer <token>`.

#### `POST /nft/prepare-mint`

Prepare a Soroban mint transaction XDR for client-side signing. The clip must:
- not already be minted or minting
- not have been auto-posted to a social platform

**Request body:**

```json
{
  "clipId": 42,
  "creatorWallet": "GC6XOTK6...",
  "royaltyBps": 1000
}
```

**Response `200`:**

```json
{
  "xdr": "AAAAAQAA...",
  "contractId": "C...",
  "clipId": 42
}
```

**Response `400`:** Clip already posted to social — cannot mint.

**Response `409`:** Clip already minted or minting.

---

#### `POST /nft/confirm-mint`

Submit the signed Stellar XDR to complete the mint.

**Request body:**

```json
{
  "clipId": 42,
  "signedXdr": "AAAAAQAA...",
  "walletAddress": "GC6XOTK6..."
}
```

**Response `200`:**

```json
{
  "mintAddress": "token-id-on-chain",
  "clipId": 42,
  "status": "minted"
}
```

---

#### `POST /nft/batch-mint`

Mint multiple clips as NFTs in a single operation.

**Request body:**

```json
{
  "clips": [
    { "clipId": 42, "royaltyBps": 1000 },
    { "clipId": 43, "royaltyBps": 500 }
  ],
  "creatorWallet": "GC6XOTK6..."
}
```

**Response `200`:** Array of mint results per clip.

---

### Subscriptions

#### `POST /subscriptions/stellar/create-intent`

Create a Stellar payment intent for a subscription plan.

**Request body:**

```json
{
  "plan": "pro",
  "walletAddress": "GC6XOTK6..."
}
```

**Response `201`:** Payment intent with memo and destination address.

---

### Health & Metrics

#### `GET /health`

Overall health check (database, Redis, queue). No authentication required.

**Response `200`:** Health status object.

---

#### `GET /metrics`

Prometheus metrics. Protected by `x-metrics-token` header.

**Response `200`:** Plain text Prometheus metrics.

---

## Workflows

### Clip Curation Workflow

A typical flow for creating and curating clips from a long video:

```
1. Upload / link video
   POST /videos  →  { videoId: 7 }

2. Trigger clip generation
   POST /clips/generate  →  { jobId: "abc123" }
   (Connect via WebSocket /clips-gateway to receive real-time progress events)

3. List generated clips
   GET /clips?videoId=7&sortBy=viralityScore&order=desc

4. Select the best clips
   POST /clips/bulk-update
   { "clipIds": [42, 43, 45], "updates": { "selected": true } }

5. Delete unwanted clips
   POST /clips/bulk-delete
   { "clipIds": [44, 46, 47] }

6. (Optional) Customise royalty before minting
   PATCH /clips/42/royalty
   { "royaltyBps": 750 }

7. Publish selected clips to social platforms
   POST /clips/42/publish
   { "platforms": ["tiktok", "instagram"] }
```

---

### NFT Minting Workflow

Mint a clip as an NFT on the Stellar Soroban network:

```
1. Ensure the clip is ready and NOT posted to social media
   GET /clips/42
   { nftStatus: "none", postStatus: null }

2. Connect / verify wallet balance
   GET /wallets/1/balance
   { balance: 5.2, warning: false }

3. Prepare the mint transaction (server builds Soroban XDR)
   POST /nft/prepare-mint
   { clipId: 42, creatorWallet: "GC6X...", royaltyBps: 1000 }
   →  { xdr: "AAAAAQAA...", contractId: "C..." }

4. User signs the XDR in browser with Freighter / Albedo wallet

5. Submit the signed transaction to complete minting
   POST /nft/confirm-mint
   { clipId: 42, signedXdr: "AAAAAQAA...", walletAddress: "GC6X..." }
   →  { mintAddress: "token-id", status: "minted" }
```

**Important constraints:**
- A clip that has been auto-posted (`postStatus = "posted"`) **cannot** be minted. This is enforced at both the guard and service layer.
- A clip can only be minted once. Attempting to mint a clip in `minting` or `minted` state returns `409 Conflict`.
- The creator wallet must hold at least 2 XLM to cover Stellar fees. The guard pre-checks this and returns `400` if the balance is insufficient.

---

## Pagination

List endpoints that return multiple records use a consistent pagination envelope:

```json
{
  "data": [ ... ],
  "meta": {
    "total": 47,
    "page": 1,
    "limit": 20,
    "totalPages": 3
  }
}
```

**Query parameters:**

| Param | Type | Default | Max | Description |
|---|---|---|---|---|
| `page` | integer | `1` | — | 1-based page number |
| `limit` | integer | `20` | `100` | Items per page |

If `limit > 100` or `limit < 1` the API returns `400 Bad Request`.

---

## API Versioning

The ClipCash API does not currently use URL versioning. All endpoints are served from the root path (e.g. `GET /clips`, not `GET /v1/clips`).

Breaking changes will be communicated via the changelog before being deployed.

For Swagger/OpenAPI interactive documentation see:
- **Development:** `http://localhost:3000/api/docs`
- **OpenAPI JSON:** `http://localhost:3000/api/docs-json` or `openapi.json` (export with `npm run openapi:export`)
