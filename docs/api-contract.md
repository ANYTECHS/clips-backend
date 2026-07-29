# ClipCash API Contract

Frontend–backend data exchange contract for ClipCash. All endpoints are relative to the base URL (e.g. `http://localhost:3000` in development).

---

## Table of Contents

1. [Global Conventions](#1-global-conventions)
2. [Authentication](#2-authentication)
3. [Videos](#3-videos)
4. [Clips](#4-clips)
5. [Wallets](#5-wallets)
6. [NFT Minting](#6-nft-minting)
7. [Payouts](#7-payouts)
8. [Subscriptions](#8-subscriptions)
9. [Earnings](#9-earnings)
10. [Users](#10-users)
11. [User Platforms](#11-user-platforms)
12. [Transactions](#12-transactions)
13. [Webhooks](#13-webhooks)
14. [Health](#14-health)
15. [Metrics](#15-metrics)
16. [WebSocket Gateway](#16-websocket-gateway)
17. [Error Shape](#17-error-shape)

---

## 1. Global Conventions

### Base URL

| Environment | URL |
|-------------|-----|
| Development | `http://localhost:3000` |
| Production  | Configured via deployment |

### Authentication

Protected endpoints require a JWT Bearer token:

```
Authorization: Bearer <accessToken>
```

Tokens are issued by the auth endpoints. The access token expires after a short TTL; use `POST /auth/refresh` to rotate it.

### Cookie Authentication

The API supports cookie-based authentication for browser-based applications, which provides enhanced security compared to token-in-body authentication. When enabled, authentication tokens are stored in secure `HttpOnly` cookies that are automatically sent by the browser with every request.

#### Enabling Cookie Mode
Append `?use_cookies=true` to the following endpoints to receive tokens in cookies instead of the response body:
- `POST /auth/signup`
- `POST /auth/login`
- `POST /auth/refresh`
- `GET /auth/verify-magic`

Google OAuth **always uses cookies** due to its redirect flow requirements.

#### Cookie Attributes

All authentication cookies are configured with strict security attributes:

| Cookie Name | Purpose | httpOnly | secure | sameSite | path | maxAge |
|--------------|---------|----------|--------|----------|------|--------|
| `access_token` | JWT access token for API authentication | ✅ Yes | Depends on `COOKIE_SECURE` env var (default: true in production) | Configurable via `COOKIE_SAME_SITE` (default: `lax`) | `/` (all endpoints) | 1 hour (configurable via `JWT_EXPIRES`) |
| `refresh_token` | Long-lived refresh token for token rotation | ✅ Yes | Same as above | Same as above | `/auth/refresh` (only sent to refresh endpoint) | 14 days (configurable via `JWT_REFRESH_EXPIRES_DAYS`) |
| `_csrf` | CSRF protection token | ❌ No (must be readable by JS) | True in production | `strict` | `/` | 24 hours |

#### Attribute Details
- **httpOnly**: Prevents JavaScript access to authentication tokens, mitigating XSS attacks
- **secure**: Only sends cookies over HTTPS connections in production
- **sameSite**: Restricts cookie sending to same-site requests, preventing CSRF attacks
- **path restriction**: Refresh token is only sent to the refresh endpoint, limiting exposure
- **maxAge**: Automatic expiration reduces window of opportunity for token misuse

### CSRF Protection

When using cookie authentication, the API implements CSRF protection:
1. On successful authentication (login, Google OAuth), the server sets a `_csrf` cookie and returns a `csrfToken` in the response body
2. All state-mutating (non-GET) requests from browsers must include this token in the `x-csrf-token` header
3. The server validates that the header value matches the cookie value before processing the request

### Rate Limits

| Throttle bucket | Limit |
|-----------------|-------|
| `auth` | 10 req / 60 s |
| `sensitive` (forgot-password) | 3 req / 15 min |
| `nftMint` | 5 req / 60 s |
| `walletConnect` / `walletDisconnect` | 10 req / 60 s |
| `transactionSend` | 5 req / 60 s |
| `walletBalance` | 30 req / 60 s |

Exceeding a limit returns **429 Too Many Requests**.

### Pagination

List endpoints that support pagination accept:

| Query param | Type | Default | Description |
|-------------|------|---------|-------------|
| `page` | integer | `1` | Page number (1-indexed) |
| `limit` | integer | `20` | Items per page |

Paginated responses follow the shape:

```json
{
  "data": [ ...items ],
  "total": 42,
  "page": 1,
  "limit": 20
}
```

---

## 2. Authentication

### POST /auth/signup

Register a new user account.

**Request**

```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "SecurePass123!"
}
```

| Field | Type | Required | Rules |
|-------|------|----------|-------|
| `name` | string | Yes | 2–50 characters |
| `email` | string | Yes | Valid email format |
| `password` | string | Yes | 8–32 characters |

**Response `201`**

```json
{
  "user": {
    "id": 1,
    "name": "John Doe",
    "email": "john@example.com",
    "emailVerified": false
  },
  "tokens": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

**Errors:** `400` invalid input or email already registered · `429` rate limit

---

### POST /auth/login

Authenticate and receive tokens.

**Request**

```json
{
  "email": "john@example.com",
  "password": "SecurePass123!",
  "totpCode": "123456"
}
```

| Field | Type | Required | Rules |
|-------|------|----------|-------|
| `email` | string | Yes | Valid email |
| `password` | string | Yes | Min 8 characters |
| `totpCode` | string | No | 6-digit TOTP code (required when MFA is enabled) |

**Response `200`**

```json
{
  "user": {
    "id": 1,
    "name": "John Doe",
    "email": "john@example.com",
    "emailVerified": true
  },
  "tokens": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  },
  "csrfToken": "csrf-token-value"
}
```

**Errors:** `400` invalid credentials · `401` authentication failed · `429` brute-force protection

---

### POST /auth/refresh

Rotate access token using a refresh token.

**Request**

```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

Alternatively, when using cookie mode the refresh token is read from the `refresh_token` cookie and the body can be empty `{}`.

**Response `200`**

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Errors:** `400` missing or expired refresh token

---

### POST /auth/logout

Revoke refresh token and clear cookies.

**Request**

```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Response `204`** — no body

---

### POST /auth/magic-link

Request a passwordless login link.

**Request**

```json
{
  "email": "john@example.com"
}
```

**Response `200`**

```json
{
  "message": "If that email exists, a magic link has been sent."
}
```

Always returns `200` to prevent email enumeration.

---

### GET /auth/verify-magic?token=\<token\>

Verify a magic link token and receive access tokens.

| Query param | Required | Description |
|-------------|----------|-------------|
| `token` | Yes | Token from the magic link email |
| `use_cookies` | No | `true` to receive tokens in cookies |

**Response `200`** — same shape as login response

**Errors:** `400` invalid or expired token

---

### GET /auth/verify-email?token=\<token\>

Confirm an email verification token.

**Response `200`**

```json
{
  "message": "Email verified successfully."
}
```

**Errors:** `400` invalid or expired token

---

### POST /auth/forgot-password

Send a password reset link.

**Request**

```json
{
  "email": "john@example.com"
}
```

**Response `200`**

```json
{
  "message": "If that email exists, a reset link has been sent."
}
```

Rate limited: 3 requests per 15 minutes.

---

### POST /auth/reset-password

Set a new password using a reset token.

**Request**

```json
{
  "token": "reset-token-from-email",
  "newPassword": "NewSecurePass456!"
}
```

**Response `200`**

```json
{
  "message": "Password reset successful."
}
```

**Errors:** `400` invalid token or password does not meet requirements

---

### GET /auth/google

Initiates Google OAuth flow. Redirects the browser to Google. No request body.

**Response `302`** — redirect to Google

---

### GET /auth/google/callback

Handles Google OAuth redirect. Returns tokens in cookies.

**Response `200`**

```json
{
  "user": {
    "id": 1,
    "name": "John Doe",
    "email": "john@example.com"
  },
  "csrfToken": "csrf-token-value"
}
```

---

### POST /auth/mfa/setup _(requires JWT)_

Generate a TOTP secret and QR code.

**Response `200`**

```json
{
  "secret": "JBSWY3DPEHPK3PXP",
  "otpauthUrl": "otpauth://totp/ClipCash:john@example.com?secret=JBSWY3DPEHPK3PXP&issuer=ClipCash",
  "qrCode": "data:image/png;base64,..."
}
```

---

### POST /auth/mfa/enable _(requires JWT)_

Enable MFA after verifying the setup code.

**Request**

```json
{
  "code": "123456"
}
```

**Response `200`**

```json
{
  "enabled": true
}
```

**Errors:** `400` invalid verification code

---

### POST /auth/mfa/disable _(requires JWT)_

Disable MFA for the authenticated user.

**Response `200`**

```json
{
  "enabled": false
}
```

---

## 3. Videos

All video endpoints require `Authorization: Bearer <accessToken>`.

### GET /videos

List videos for the authenticated user.

**Response `200`**

```json
{
  "message": "Videos endpoint"
}
```

> Endpoint is present; full pagination will be added in a future release.

---

### POST /videos/upload

Upload a video file for clip generation. Uses `multipart/form-data`.

**Request** (`Content-Type: multipart/form-data`)

| Field | Type | Required | Rules |
|-------|------|----------|-------|
| `file` | binary | Yes | `.mp4`, `.mov`, `.avi`, `.webm` — max 500 MB |
| `title` | string | No | Optional video title |

**Response `202`**

```json
{
  "jobId": "job_abc123xyz",
  "videoId": 123,
  "status": "accepted",
  "message": "Video upload accepted and queued for processing",
  "estimatedProcessingTime": 120
}
```

| Field | Type | Description |
|-------|------|-------------|
| `jobId` | string | BullMQ job ID for status polling |
| `videoId` | number | Database ID assigned to the video |
| `status` | `"accepted"` \| `"rejected"` | Upload acceptance status |
| `estimatedProcessingTime` | number | Seconds (approximate) |

**Errors:** `400` invalid file format or no file uploaded · `401` unauthorized

---

### POST /videos/:id/cancel

Cancel ongoing clip generation for a video.

**Response `200`**

```json
{
  "message": "Video processing cancelled",
  "videoId": "123"
}
```

**Errors:** `401` unauthorized · `404` video not found

---

## 4. Clips

All clips endpoints require `Authorization: Bearer <accessToken>`.

### POST /clips/generate

Enqueue a clip-generation job. Returns a job ID immediately; processing is asynchronous. Listen for progress via the [WebSocket gateway](#16-websocket-gateway).

Limited to **5 active jobs** per user (returns `429` when exceeded).

**Request**

```json
{
  "videoId": "123",
  "inputPath": "/tmp/uploads/source.mp4",
  "outputPath": "/tmp/clips/clip-123-10-40.mp4",
  "startTime": 10.5,
  "endTime": 40.0,
  "positionRatio": 0.15,
  "videoDuration": 600,
  "transcript": "This is the most exciting part of the video",
  "title": "Game-winning goal",
  "clipId": null,
  "existingViralityScore": null,
  "royaltyBps": 1000
}
```

| Field | Type | Required | Rules |
|-------|------|----------|-------|
| `videoId` | string | Yes | ID of the source video |
| `inputPath` | string | Yes | Absolute path to the source video file |
| `outputPath` | string | Yes | Desired output path for the clip |
| `startTime` | number | Yes | Start time in seconds (≥ 0) |
| `endTime` | number | Yes | End time in seconds (> `startTime`); duration must be 5–300 s |
| `positionRatio` | number | Yes | Relative position in source video (0–1) |
| `videoDuration` | number | No | Full source video duration in seconds |
| `transcript` | string | No | Transcript text for the clip segment |
| `title` | string | No | Clip title |
| `clipId` | number | No | Existing clip ID when regenerating |
| `existingViralityScore` | number | No | Score to preserve when regenerating |
| `royaltyBps` | number | No | NFT royalty in BPS (0–1500); default `1000` (10%) |

**Response `201`**

```json
{
  "jobId": "bull:clip-generation:1234",
  "status": "queued"
}
```

**Errors:** `400` invalid data · `429` queue rate limit exceeded

---

### GET /clips

List clips with optional filtering and sorting.

| Query param | Type | Default | Description |
|-------------|------|---------|-------------|
| `videoId` | string | — | Filter to a specific source video |
| `sort` | string | `viralityScore:desc` | Combined sort: `field:order` (e.g. `createdAt:asc`) |
| `sortBy` | string | — | Legacy: `viralityScore` \| `createdAt` \| `duration` |
| `order` | string | — | Legacy: `asc` \| `desc` |
| `page` | integer | `1` | Page number |
| `limit` | integer | `20` | Items per page |

**Response `200`**

```json
{
  "data": [
    {
      "id": "123-10.5-40.0",
      "videoId": "123",
      "userId": "1",
      "startTime": 10.5,
      "endTime": 40.0,
      "duration": 30,
      "positionRatio": 0.15,
      "transcript": "This is the most exciting part...",
      "viralityScore": 87.5,
      "clipUrl": "https://res.cloudinary.com/example/video/upload/v1/clip.mp4",
      "thumbnail": "https://res.cloudinary.com/example/image/upload/v1/clip.jpg",
      "status": "success",
      "error": null,
      "selected": false,
      "postStatus": null,
      "caption": "Game-winning goal 🎬",
      "royaltyBps": 1000,
      "mintAddress": null,
      "mintedAt": null,
      "nftStatus": "none",
      "createdAt": "2026-06-01T12:00:00.000Z",
      "updatedAt": "2026-06-01T12:01:00.000Z"
    }
  ],
  "total": 42,
  "page": 1,
  "limit": 20
}
```

**Clip object fields**

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Clip ID |
| `videoId` | string | Source video ID |
| `userId` | string | Owner user ID |
| `startTime` | number | Start time in seconds |
| `endTime` | number | End time in seconds |
| `duration` | number | Actual clip duration in seconds |
| `positionRatio` | number | 0–1 position in source video |
| `viralityScore` | number \| null | AI engagement score (0–100); null until generated |
| `clipUrl` | string \| null | Cloudinary CDN URL for the clip video |
| `thumbnail` | string \| null | Cloudinary CDN URL for the thumbnail |
| `status` | string | `pending` \| `processing` \| `success` \| `failed` \| `upload_failed` \| `upload_processed` |
| `selected` | boolean | Whether the user has curated this clip |
| `postStatus` | string \| object \| null | `pending` \| `posted` \| `failed`, or platform-specific JSON |
| `caption` | string \| null | Auto-generated caption; editable by user |
| `royaltyBps` | number \| null | NFT royalty in BPS (0–1500); default 1000 |
| `mintAddress` | string \| null | On-chain token ID after successful mint |
| `mintedAt` | string \| null | ISO timestamp of confirmed on-chain mint |
| `nftStatus` | string | `none` \| `minting` \| `minted` \| `failed` |

---

### GET /clips/:id

Get a single clip by ID.

**Response `200`** — single clip object (same shape as above)

**Errors:** `404` clip not found

---

### POST /clips/bulk-update

Bulk-update `selected`, `postStatus`, `caption`, or `royaltyBps` for multiple clips in one transaction. All clip IDs must belong to the requesting user.

**Request**

```json
{
  "clipIds": [1, 2, 3],
  "updates": {
    "selected": true,
    "postStatus": "pending",
    "caption": "Check out this clip! 🎬",
    "royaltyBps": 800
  }
}
```

| Field | Type | Required | Rules |
|-------|------|----------|-------|
| `clipIds` | number[] | Yes | Non-empty array of integer clip IDs |
| `updates.selected` | boolean | No | Mark clips as curated/selected |
| `updates.postStatus` | string \| object | No | `pending` \| `posted` \| `failed` or platform-specific JSON |
| `updates.caption` | string | No | Override auto-generated caption |
| `updates.royaltyBps` | number | No | NFT royalty in BPS (0–1500) |

**Response `200`**

```json
{
  "updated": 3,
  "notFoundIds": []
}
```

---

### POST /clips/bulk-delete

Soft-delete multiple rejected clips.

**Request**

```json
{
  "clipIds": [4, 5, 6]
}
```

**Response `200`**

```json
{
  "deleted": 3
}
```

---

### POST /clips/:id/regenerate

Re-run FFmpeg cut for a single clip using its original timestamps.

Limited to **5 active jobs** per user.

**Response `200`**

```json
{
  "jobId": "bull:clip-generation:5678",
  "status": "queued"
}
```

**Errors:** `404` clip not found · `429` queue rate limit exceeded

---

### PATCH /clips/:id/caption

Update the auto-generated caption for a clip.

**Request**

```json
{
  "caption": "My custom caption for TikTok 🚀"
}
```

**Response `200`** — updated clip object

**Errors:** `400` caption missing or not a string · `404` clip not found

---

### PATCH /clips/:id/royalty

Configure the NFT royalty for a clip before minting.

**Request**

```json
{
  "royaltyBps": 800
}
```

| Field | Type | Required | Rules |
|-------|------|----------|-------|
| `royaltyBps` | number | Yes | 0–1500 BPS (0–15%); defaults to `1000` when omitted |

**Response `200`** — updated clip object

**Errors:** `400` invalid royaltyBps · `403` not the clip owner · `404` clip not found

---

## 5. Wallets

All wallet endpoints require `Authorization: Bearer <accessToken>`.

> Wallet addresses are **partially masked** in all responses. Only the last 6 characters are shown (e.g. `******KPRQ6A`).

### POST /wallets/connect

Connect or re-activate a wallet for the authenticated user. If a wallet with the same address + chain already exists it is re-activated.

Rate limited: 10 requests / 60 s.

**Request**

```json
{
  "address": "GC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3",
  "chain": "stellar",
  "type": "freighter",
  "publicKey": "GC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3",
  "signature": "abc123==",
  "signedMessage": "Connect ClipCash wallet 1719266696836"
}
```

| Field | Type | Required | Rules |
|-------|------|----------|-------|
| `address` | string | Yes | Wallet address for the chosen chain |
| `chain` | string | No | `stellar` \| `solana` \| `base`; defaults to `stellar` |
| `type` | string | Yes | `freighter` \| `lobstr` \| `albedo` \| `phantom` \| `solflare` \| `backpack` \| `metamask` \| `coinbase` \| `walletconnect` |
| `publicKey` | string | Yes | Stellar ED25519 public key — starts with `G`, exactly 56 Base32 chars |
| `signature` | string | Yes | Base64-encoded signature of `signedMessage` |
| `signedMessage` | string | Yes | The plaintext nonce that was signed (proves key ownership) |

**Response `200`**

```json
{
  "id": 7,
  "address": "******UHTZF3",
  "chain": "stellar",
  "type": "freighter",
  "connectedAt": "2026-06-01T12:00:00.000Z"
}
```

**Errors:** `400` invalid data or signature verification failed

---

### GET /wallets

List all active wallets for the authenticated user.

**Response `200`**

```json
[
  {
    "id": 7,
    "address": "******UHTZF3",
    "chain": "stellar",
    "type": "freighter",
    "connectedAt": "2026-06-01T12:00:00.000Z"
  }
]
```

---

### GET /wallets/:id

Get a single wallet by ID. The wallet must belong to the authenticated user.

**Response `200`**

```json
{
  "id": 7,
  "address": "******UHTZF3",
  "chain": "stellar",
  "type": "freighter",
  "connectedAt": "2026-06-01T12:00:00.000Z"
}
```

**Errors:** `404` wallet not found

---

### GET /wallets/:id/balance

Get the current native XLM balance for a wallet.

Rate limited: 30 requests / 60 s.

**Response `200`**

```json
{
  "balance": 5.2,
  "warning": false
}
```

| Field | Type | Description |
|-------|------|-------------|
| `balance` | number | Available XLM balance |
| `warning` | boolean | `true` when balance is below 2 XLM (may cause mint failures) |

**Errors:** `400` invalid wallet address · `404` wallet not found or Stellar account does not exist · `500` Horizon network request failed

---

### DELETE /wallets/:id

Soft-delete (disconnect) a wallet. Blocked when the wallet has pending payouts or active NFTs.

Rate limited: 10 requests / 60 s.

**Response `200`**

```json
{
  "message": "Wallet disconnected successfully",
  "walletId": 7
}
```

**Errors:** `400` pending payouts or active NFTs exist · `409` wallet already disconnected · `404` wallet not found

---

## 6. NFT Minting

### Clip Curation and Mint Flow

The typical frontend workflow for minting a clip as an NFT:

1. **Curate** — User reviews clips from `GET /clips` and selects the best ones via `POST /clips/bulk-update`.
2. **Set royalty** _(optional)_ — Call `PATCH /clips/:id/royalty` to configure the creator royalty (0–1500 BPS).
3. **Prepare mint** — Call `POST /nfts/prepare-mint` to receive an unsigned Soroban transaction XDR.
4. **Sign** — The frontend passes the XDR to Freighter or Albedo for user signing. No private keys leave the browser.
5. **Confirm mint** — Call `POST /nfts/confirm-mint` with the clip ID and on-chain mint address to persist the result.
6. **Verify ownership** _(optional)_ — Call `POST /nfts/verify-ownership` to verify on-chain ownership at any time.

> Clips with `postStatus = "posted"` cannot be minted and return `400`.

---

### POST /nfts/mint _(requires JWT + NftMintGuard)_

Build metadata, upload to IPFS if needed, and mint in one call.

Rate limited: 5 requests / 60 s.

**Request**

```json
{
  "clipId": 42,
  "creatorWallet": "GC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3",
  "metadataUri": "ipfs://QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG",
  "royaltyBps": 1000,
  "creatorLabel": "Creator",
  "royaltyDescription": "10% creator royalty + 2% platform fee on every secondary sale."
}
```

| Field | Type | Required | Rules |
|-------|------|----------|-------|
| `clipId` | number | Yes | Integer clip ID (≥ 1) |
| `creatorWallet` | string | Yes | Stellar wallet address of the NFT creator |
| `metadataUri` | string | No | IPFS / Arweave URI; built automatically when omitted |
| `royaltyBps` | number | No | Creator royalty in BPS (0–1500); default `1000` (10%) |
| `creatorLabel` | string | No | Human-readable label for creator royalty recipient |
| `royaltyDescription` | string | No | Description of royalty arrangement for NFT metadata |

**Response `201`**

```json
{
  "clipId": "42",
  "creatorWallet": "GC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3",
  "metadataUri": "ipfs://QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG",
  "royaltyBps": 1000,
  "royalties": [
    { "wallet": "GC6XOTK6L...UHTZF3", "bps": 1000, "label": "creator" },
    { "wallet": "GPLATFORM...ABCD12", "bps": 100,  "label": "platform" }
  ],
  "status": "minted"
}
```

**Errors:** `400` invalid payload · `403` mint guard rejected

---

### POST /nfts/prepare-mint _(requires JWT)_

Prepare an unsigned Soroban mint transaction and return XDR for client-side signing.

Rate limited: 5 requests / 60 s.

**Request**

```json
{
  "clipId": 42,
  "walletAddress": "GC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3"
}
```

| Field | Type | Required | Rules |
|-------|------|----------|-------|
| `clipId` | number | Yes | Integer clip ID (≥ 1) |
| `walletAddress` | string | Yes | Stellar wallet that will sign the transaction |

**Response `201`**

```json
{
  "xdr": "AAAAAgAAAAA...",
  "clipId": 42,
  "metadataUri": "ipfs://QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG"
}
```

Pass `xdr` to the user's Freighter/Albedo wallet for signing, then call `POST /nfts/confirm-mint`.

**Errors:** `400` invalid clip or wallet · `403` caller does not own the clip · `401` unauthorized

---

### POST /nfts/confirm-mint _(requires JWT)_

Record a completed on-chain NFT mint. Call this after the user signs and submits the transaction.

Rate limited: 10 requests / 60 s.

**Request**

```json
{
  "clipId": 42,
  "mintAddress": "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEU4"
}
```

| Field | Type | Required | Rules |
|-------|------|----------|-------|
| `clipId` | number | Yes | Clip ID that was minted |
| `mintAddress` | string | Yes | On-chain contract token identifier |

**Response `200`**

```json
{
  "id": 42,
  "mintAddress": "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEU4",
  "mintedAt": "2026-06-01T12:05:00.000Z",
  "nftStatus": "minted"
}
```

**Errors:** `400` clip already minted or invalid request · `404` clip not found

---

### POST /nfts/batch-mint

Mint multiple clip NFTs in a single transaction (Issue #671). Validates array lengths, enforces gas-limit safeguards (max 50 clips per call), emits `BatchMint` event, and handles partial failures gracefully.

**Request**

```json
{
  "creatorWallet": "GC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3",
  "clips": [
    { "clipId": "101", "metadataUri": "ipfs://QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG", "isSoulbound": false },
    { "clipId": "102", "metadataUri": "ipfs://QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco", "isSoulbound": true }
  ],
  "royaltyBps": 1000
}
```

**Response `201`**

```json
{
  "success": true,
  "mintedCount": 2,
  "tokenIds": ["101", "102"],
  "partialFailures": []
}
```

**Errors:** `400` mismatched array lengths, empty batch, or batch size > 50

---

### PATCH /nfts/:id/token-uri _(requires JWT)_

Update custom per-token metadata URI for an NFT (Issue #670). Restricts updates strictly to the NFT owner.

**Request**

```json
{
  "uri": "ipfs://QmUpdatedMetadataHash12345"
}
```

**Response `200`**

```json
{
  "tokenId": "42",
  "uri": "ipfs://QmUpdatedMetadataHash12345",
  "updated": true
}
```

**Errors:** `403` caller is not the NFT owner · `404` NFT token not found


---

### POST /nfts/verify-ownership

Verify on-chain NFT ownership via the Soroban `owner_of` contract method. Does not require authentication.

**Request**

```json
{
  "mintAddress": "42",
  "walletAddress": "GC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3"
}
```

**Response `200`**

```json
{
  "valid": true
}
```

When the wallet does not own the token:

```json
{
  "valid": false,
  "error": "NFT is not owned by the specified wallet"
}
```

**Errors:** `400` invalid address format · `404` token not found on-chain · `500` Soroban RPC failure

---

### GET /nfts/:clipId/metadata

Get OpenSea-compatible NFT metadata for a clip. Does not require authentication.

**Response `200`**

```json
{
  "name": "Game-winning goal",
  "description": "ClipCash generated clip 42",
  "image": "https://cdn.example.com/thumbs/42.jpg",
  "animation_url": "https://cdn.example.com/clips/42.mp4",
  "seller_fee_basis_points": 1000
}
```

**Errors:** `404` clip not found or not ready (missing `clipUrl`)

---

### GET /nfts/:mintAddress/royalty _(requires JWT)_

Query on-chain royalty info for a minted NFT. Results are cached in Redis for 5 minutes.

**Response `200`**

```json
{
  "royaltyBps": 1000,
  "recipient": "GC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3"
}
```

**Errors:** `404` royalty data not found for the given mint address

---

## 7. Payouts

All payout endpoints require `Authorization: Bearer <accessToken>`.

### Payout Lifecycle

```
pending → pending_approval → approved → processing → completed
                                      ↘ failed
       ↘ canceled  (user-initiated before approval)
       ↘ rejected  (admin-initiated)
```

### POST /payouts/request

Request a creator payout.

**Request**

```json
{
  "amount": 100.0,
  "currency": "USD",
  "method": "stellar"
}
```

| Field | Type | Required | Rules |
|-------|------|----------|-------|
| `amount` | number | Yes | Minimum `0.01`; must meet `MIN_PAYOUT_USD` (default 5 USD) |
| `currency` | string | Yes | Currency code (e.g. `"USD"`) |
| `method` | string | Yes | `"fiat"` \| `"stellar"` |

**Response `201`**

```json
{
  "id": 15,
  "amount": 100.0,
  "currency": "USD",
  "method": "stellar",
  "status": "pending",
  "onChainTxHash": null,
  "createdAt": "2026-06-01T12:00:00.000Z"
}
```

**Errors:** `400` invalid request or insufficient balance · `409` pending payout already exists

---

### POST /payouts/initiate-stellar

Prepare an unsigned Stellar payout transaction XDR for client-side signing.

**Request**

```json
{
  "payoutId": 15,
  "amount": 100.0
}
```

| Field | Type | Required | Rules |
|-------|------|----------|-------|
| `payoutId` | number | Yes | Integer payout record ID (≥ 1) |
| `amount` | number | Yes | Payout amount (≥ 0.01) |

**Response `201`**

```json
{
  "payoutId": 15,
  "xdr": "AAAAAgAAAADh1...",
  "status": "pending"
}
```

Pass `xdr` to the user's Stellar wallet for signing, then submit the signed transaction on-chain.

**Errors:** `400` invalid request or insufficient balance · `404` payout not found

---

### GET /payouts

List payouts for the authenticated user.

| Query param | Type | Description |
|-------------|------|-------------|
| `status` | string | Filter by status: `pending` \| `pending_approval` \| `approved` \| `processing` \| `completed` \| `failed` \| `rejected` \| `canceled` |

**Response `200`**

```json
[
  {
    "id": 15,
    "amount": 100.0,
    "currency": "USD",
    "method": "stellar",
    "status": "completed",
    "onChainTxHash": "a1b2c3d4e5f6...",
    "confirmedAt": "2026-06-01T12:05:00.000Z",
    "retryCount": 1,
    "createdAt": "2026-06-01T12:00:00.000Z"
  }
]
```

| Field | Type | Description |
|-------|------|-------------|
| `onChainTxHash` | string \| null | Stellar transaction hash once submitted |
| `confirmedAt` | string \| null | Timestamp when the transaction was confirmed on Horizon |
| `retryCount` | number | Number of on-chain confirmation poll attempts |

---

### GET /payouts/:id

Get a specific payout by ID.

**Response `200`**

```json
{
  "id": 15,
  "amount": 100.0,
  "currency": "USD",
  "method": "stellar",
  "status": "pending",
  "onChainTxHash": null,
  "confirmedAt": null,
  "retryCount": 0,
  "stellarXdr": "AAAAAgAAAADh1...",
  "createdAt": "2026-06-01T12:00:00.000Z"
}
```

`stellarXdr` is present while the payout is awaiting a user signature.

**Errors:** `404` payout not found

---

### POST /payouts/:id/process

Trigger the Stellar transfer and verify the on-chain transaction. Typically called by an admin or internal job.

**Response `200`**

```json
{
  "id": 15,
  "status": "completed",
  "onChainTxHash": "a1b2c3d4e5f6...",
  "confirmedAt": "2026-06-01T12:05:00.000Z"
}
```

**Errors:** `400` payout not approved or verification failed · `404` payout not found

---

### POST /payouts/:id/cancel

Cancel a pending payout request.

**Response `200`**

```json
{
  "id": 15,
  "status": "canceled",
  "createdAt": "2026-06-01T12:00:00.000Z"
}
```

**Errors:** `400` payout cannot be canceled (already processing or completed) · `404` payout not found

---

## 8. Subscriptions

All subscription endpoints require `Authorization: Bearer <accessToken>`.

### POST /subscriptions/create-stellar

Create a Stellar payment intent for a subscription. Supports XLM, USDC, and custom Stellar assets.

`POST /subscriptions/create-intent` is an alias for this endpoint.

**Request**

```json
{
  "plan": "pro",
  "asset": "xlm",
  "amount": 10,
  "walletId": "wallet_abc123",
  "destinationAddress": "GC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3",
  "memo": "sub-pro-2026-07",
  "assetCode": null,
  "assetIssuer": null
}
```

| Field | Type | Required | Rules |
|-------|------|----------|-------|
| `plan` | string | Yes | Subscription plan identifier (e.g. `"pro"`) |
| `asset` | string | Yes | `"xlm"` \| `"usdc"` \| `"custom"` |
| `amount` | number | Yes | Payment amount in the selected asset |
| `walletId` | string | No | Connected Stellar wallet ID |
| `destinationAddress` | string | No | Override destination Stellar address |
| `memo` | string | No | Payment memo for tracking |
| `assetCode` | string | Required when `asset = "custom"` | Stellar asset code (e.g. `"EURC"`) |
| `assetIssuer` | string | Required when `asset = "custom"` | Issuing account public key |

**Response `201`** (success) or **`202`** (pending confirmation)

```json
{
  "id": "pi_01HXYZ",
  "amount": 10,
  "asset": "xlm",
  "destination": "GC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3",
  "memo": "sub-pro-2026-07",
  "expiresAt": "2026-07-27T14:15:00.000Z",
  "status": "pending",
  "assetIssuer": null
}
```

**Errors:** `400` invalid input or unsupported asset

---

### GET /subscriptions/stellar/pending

Get all pending Stellar payment intents for the authenticated user.

**Response `200`** — array of payment intent objects (same shape as above)

---

### POST /subscriptions/stellar/verify

Verify a Stellar payment by transaction hash and activate the subscription if confirmed.

| Query param | Required | Description |
|-------------|----------|-------------|
| `paymentIntentId` | Yes | Payment intent ID |
| `transactionHash` | Yes | Stellar transaction hash |

**Response `200`** — payment verified and subscription activated:

```json
{
  "verified": true
}
```

**Response `202`** — verification still pending:

```json
{
  "verified": false
}
```

**Errors:** `400` missing parameters · `404` payment intent not found

---

## 9. Earnings

All earnings endpoints require `Authorization: Bearer <accessToken>`, except `GET /earnings/leaderboard` which is public.

### GET /earnings/metrics

Get aggregated earnings dashboard metrics.

| Query param | Type | Default | Description |
|-------------|------|---------|-------------|
| `currency` | string | `USD` | `USD` \| `XLM` |

**Response `200`**

```json
{
  "totalEarnings": 1250.50,
  "currency": "USD",
  "periodEarnings": 320.00,
  "earningsByPlatform": {
    "tiktok": 800.00,
    "youtube": 450.50
  },
  "pendingPayouts": 50.00
}
```

**Errors:** `400` invalid currency parameter

---

### GET /earnings/export

Export earnings data as a CSV file download.

| Query param | Type | Description |
|-------------|------|-------------|
| `startDate` | string | Start date filter `YYYY-MM-DD` |
| `endDate` | string | End date filter `YYYY-MM-DD` |
| `format` | string | Export format — only `csv` is supported |

**Response `200`** — CSV file with headers:

```
Content-Type: text/csv; charset=utf-8
Content-Disposition: attachment; filename="earnings-2026-07.csv"
```

**Errors:** `400` unsupported format or invalid parameters

---

### GET /earnings

Get paginated earnings data.

| Query param | Type | Default | Description |
|-------------|------|---------|-------------|
| `page` | integer | `1` | Page number |
| `limit` | integer | `20` | Items per page |
| `currency` | string | `USD` | `USD` \| `XLM` |

**Response `200`**

```json
{
  "data": [
    {
      "id": 101,
      "amount": 25.00,
      "currency": "USD",
      "platform": "tiktok",
      "clipId": "42",
      "createdAt": "2026-06-01T12:00:00.000Z"
    }
  ],
  "total": 42,
  "page": 1,
  "limit": 20
}
```

---

### DELETE /earnings/:id

Soft-delete an earning record by ID.

**Response `200`**

```json
{
  "id": 101,
  "deletedAt": "2026-07-27T14:00:00.000Z"
}
```

**Errors:** `400` invalid earning ID · `404` earning record not found

---

### GET /earnings/leaderboard _(public)_

Get the top earners leaderboard. No authentication required.

| Query param | Type | Default | Max |
|-------------|------|---------|-----|
| `limit` | integer | `10` | `100` |

**Response `200`**

```json
[
  {
    "rank": 1,
    "userId": 5,
    "totalEarnings": 4200.00,
    "currency": "USD"
  }
]
```

---

### GET /earnings/by-platform

Get earnings breakdown by social platform.

**Response `200`**

```json
{
  "tiktok": 800.00,
  "youtube": 450.50,
  "instagram": 200.00
}
```

---

### GET /earnings/summary

Get a summary of total earnings.

| Query param | Type | Default | Description |
|-------------|------|---------|-------------|
| `currency` | string | `USD` | `USD` \| `XLM` |

**Response `200`**

```json
{
  "total": 1250.50,
  "currency": "USD",
  "periodStart": "2026-06-01T00:00:00.000Z",
  "periodEnd": "2026-07-27T00:00:00.000Z"
}
```

---

## 10. Users

All user endpoints require `Authorization: Bearer <accessToken>`.

### GET /users/me

Get the current user's profile.

**Response `200`**

```json
{
  "id": 1,
  "name": "John Doe",
  "email": "john@example.com",
  "emailVerified": true,
  "stellarPublicKey": "GC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3",
  "walletType": "freighter",
  "createdAt": "2026-01-01T00:00:00.000Z"
}
```

---

### POST /users/wallet/create

Generate a custodial Stellar wallet for the authenticated user. The backend holds the keys.

**Response `200`**

```json
{
  "stellarPublicKey": "GC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3"
}
```

**Errors:** `409` wallet already exists

---

## 11. User Platforms

All user-platform endpoints require `Authorization: Bearer <accessToken>`. The controller is available at both `/user-platforms` and `/user-platform`.

### POST /user-platforms

Connect a social media platform.

**Request**

```json
{
  "platform": "tiktok",
  "accessToken": "tiktok-oauth-token",
  "refreshToken": "tiktok-refresh-token",
  "expiresAt": "2026-12-31T23:59:59.000Z"
}
```

**Response `201`**

```json
{
  "id": 3,
  "platform": "tiktok",
  "userId": 1,
  "createdAt": "2026-06-01T12:00:00.000Z"
}
```

**Errors:** `400` invalid input

---

### GET /user-platforms

List all connected social platforms for the authenticated user.

**Response `200`** — array of platform connection objects

---

### GET /user-platforms/platform/:platform

Find a platform connection by platform name.

**Response `200`** — platform connection object

**Errors:** `404` platform not connected

---

### GET /user-platforms/:id

Get a platform connection by its database ID.

**Response `200`** — platform connection object

**Errors:** `404` not found

---

### PUT /user-platforms/:id

Update an existing platform connection (e.g. refresh an OAuth token).

**Response `200`** — updated platform connection object

**Errors:** `400` invalid input · `404` not found

---

### DELETE /user-platforms/:id

Disconnect (remove) a platform connection.

**Response `204`** — no body

**Errors:** `404` not found

---

## 12. Transactions

Requires `Authorization: Bearer <accessToken>`.

### POST /transactions/send

Send XLM from the user's custodial wallet. The backend builds, signs, and submits the Stellar transaction — the frontend only supplies the destination and amount.

Use the `Idempotency-Key` header to safely retry without double-spending.

Rate limited: 5 requests / 60 s.

**Headers**

| Header | Required | Description |
|--------|----------|-------------|
| `Authorization` | Yes | `Bearer <accessToken>` |
| `Idempotency-Key` | No | Unique string to make retries safe |

**Request**

```json
{
  "destination": "GC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3",
  "amount": "10.5"
}
```

| Field | Type | Required | Rules |
|-------|------|----------|-------|
| `destination` | string | Yes | Valid Stellar public key (`G...`, 56 chars) |
| `amount` | string | Yes | Decimal string, 0.0000001–10 000 XLM, max 7 decimal places |

**Limits**

- Per-transaction maximum: **10 000 XLM**
- Rolling 24-hour limit: **50 000 XLM**

**Response `200`**

```json
{
  "hash": "a1b2c3d4e5f6...",
  "status": "submitted"
}
```

**Errors:** `400` invalid destination or amount / self-send attempt · `404` no custodial wallet found · `422` daily volume limit reached · `429` rate limit exceeded

---

## 13. Webhooks

Webhook endpoints are **public** (no JWT required) but are protected by HMAC signature verification.

### POST /webhooks/tiktok

Receive TikTok webhook events.

**Headers**

| Header | Required | Description |
|--------|----------|-------------|
| `x-tiktok-signature` | Yes | TikTok HMAC signature of the payload |

**Response `200`**

```json
{ "received": true }
```

**Errors:** `400` invalid signature or payload

---

### POST /webhooks/youtube

Receive YouTube PubSub webhook events.

**Headers**

| Header | Required | Description |
|--------|----------|-------------|
| `x-hub-signature-256` | Yes | YouTube HMAC-SHA256 signature |

**Response `200`**

```json
{ "received": true }
```

**Errors:** `400` invalid signature or payload

---

## 14. Health

Health check endpoints are **public** (no JWT required).

### GET /health/redis-memory

Check Redis memory utilisation. Returns `503` when usage exceeds the 80% alert threshold.

**Response `200`**

```json
{
  "status": "ok",
  "stats": {
    "usedMemoryMb": 45.2,
    "maxMemoryMb": 256.0,
    "usagePercent": 17.7,
    "isAboveThreshold": false,
    "alert": null,
    "unavailable": false
  }
}
```

**Response `503`** — degraded (same shape, `status: "degraded"`)

---

### GET /health/redis

Check Redis connection and round-trip latency.

**Response `200`**

```json
{
  "status": "ok",
  "connected": true,
  "latencyMs": 2
}
```

**Response `503`** — Redis unreachable

---

### GET /health/queues

Queue health metrics for all BullMQ queues.

**Response `200`**

```json
{
  "status": "healthy",
  "queues": [
    {
      "name": "clip-generation",
      "waiting": 0,
      "active": 1,
      "completed": 120,
      "failed": 3,
      "failureRate": 0.024
    }
  ]
}
```

**Response `503`** — one or more queues unhealthy

---

### GET /health/queues/statistics

Detailed BullMQ queue statistics.

**Response `200`** — extended queue stats including processing times and failure analysis.

---

## 15. Metrics

Prometheus-compatible metrics endpoint. Protected by a static token, **not** JWT.

### GET /metrics

**Headers**

| Header | Required | Description |
|--------|----------|-------------|
| `x-metrics-token` | Yes | Value of the `METRICS_TOKEN` environment variable |

**Response `200`** — Prometheus text format

Tracked metrics include:

| Metric | Labels | Description |
|--------|--------|-------------|
| `clipcash_clips_generated_total` | `status=success\|failure` | Total clip generation attempts |
| `clipcash_nft_mints_total` | `status=success\|failure` | Total NFT mint attempts |
| `clipcash_job_queue_depth` | `queue=clip-generation` | Current queue depth |
| `clipcash_http_request_duration_seconds` | `method, route, status_code` | HTTP request durations histogram |
| `clipcash_stellar_rpc_errors_total` | — | Soroban RPC error count |
| `clipcash_cloudinary_upload_errors_total` | — | Cloudinary upload error count |

**Response `403`** — missing or invalid `x-metrics-token`

---

## 16. WebSocket Gateway

Real-time clip-generation progress events are delivered over Socket.IO.

### Connection

**Namespace:** `/clips`

**URL (development):** `ws://localhost:3000/clips`

### Authentication

Pass a valid JWT using one of these methods at handshake time:

```js
// Option 1 — handshake auth object (recommended)
const socket = io('/clips', {
  auth: { token: '<accessToken>' }
});

// Option 2 — query param
const socket = io('/clips?token=<accessToken>');

// Option 3 — Authorization header (server-to-server)
// Set handshake headers: { Authorization: 'Bearer <accessToken>' }
```

Once authenticated, the socket is automatically joined to the room `user:<userId>` and only receives events for that user's jobs.

**`connected` event** (emitted by server on successful join):

```json
{ "room": "user:1" }
```

Unauthenticated clients are immediately disconnected.

---

### Events Emitted by Server

#### `clip.progress`

Fired periodically during clip generation.

```json
{
  "jobId": "bull:clip-generation:1234",
  "videoId": "123",
  "percent": 60,
  "step": "ffmpeg_cut",
  "currentClip": {
    "id": "123-10.5-40.0",
    "startTime": 10.5,
    "endTime": 40.0,
    "positionRatio": 0.15
  }
}
```

#### `clip.completed`

Fired when a clip is successfully generated and uploaded.

```json
{
  "jobId": "bull:clip-generation:1234",
  "videoId": "123",
  "clipId": "123-10.5-40.0",
  "clipUrl": "https://res.cloudinary.com/example/video/upload/v1/clip.mp4",
  "thumbnail": "https://res.cloudinary.com/example/image/upload/v1/clip.jpg",
  "status": "success"
}
```

#### `clip.failed`

Fired when clip generation fails after all retries.

```json
{
  "jobId": "bull:clip-generation:1234",
  "videoId": "123",
  "reason": "FFmpeg process exited with code 1",
  "attemptsMade": 5
}
```

---

## 17. Error Shape

All API errors return a consistent JSON body:

```json
{
  "statusCode": 400,
  "message": "Descriptive error message",
  "error": "Bad Request"
}
```

Validation errors may return `message` as an array of strings:

```json
{
  "statusCode": 400,
  "message": [
    "password must be at least 8 characters long",
    "email must be an email"
  ],
  "error": "Bad Request"
}
```

### HTTP Status Code Reference

| Status | Meaning |
|--------|---------|
| `200` | OK |
| `201` | Created |
| `202` | Accepted (async processing) |
| `204` | No Content |
| `400` | Validation error or business rule violation |
| `401` | Missing or invalid JWT |
| `403` | Forbidden (wrong user, missing role, or guard rejected) |
| `404` | Resource not found |
| `409` | Conflict (duplicate resource) |
| `422` | Unprocessable Entity (limit exceeded) |
| `429` | Rate limit exceeded |
| `500` | Internal server error |
| `503` | Service unavailable (Redis/queue unhealthy) |

---

> **Interactive reference:** Swagger UI is available at `http://localhost:3000/api/docs` when running in development mode (`NODE_ENV !== production`).
> The OpenAPI JSON spec is at `http://localhost:3000/api/docs-json` and can be imported into Postman or Insomnia.