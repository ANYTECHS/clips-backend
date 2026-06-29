# API Usage Examples

Practical request/response examples for frontend developers. All endpoints are relative to `http://localhost:3000` in development.

---

## Authentication

### Sign Up

```http
POST /auth/signup
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "StrongPass123!"
}
```

**Response `201`**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

---

### Log In

```http
POST /auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "StrongPass123!"
}
```

**Response `200`**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

---

### Refresh Token

```http
POST /auth/refresh
Content-Type: application/json

{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Response `200`**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

---

### Magic Link (Passwordless)

```http
POST /auth/magic-link
Content-Type: application/json

{
  "email": "user@example.com"
}
```

**Response `200`**
```json
{
  "message": "Magic link sent to user@example.com"
}
```

> All subsequent requests require the `Authorization: Bearer <accessToken>` header.

---

## Clip Generation

### Enqueue a Clip Generation Job

```http
POST /clips/generate
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "videoId": "42",
  "inputPath": "/tmp/uploads/video-42.mp4",
  "outputPath": "/tmp/clips/clip-42-10-40.mp4",
  "startTime": 10.5,
  "endTime": 40.0,
  "positionRatio": 0.15,
  "transcript": "This is the most exciting part of the video",
  "title": "My YouTube Video"
}
```

**Response `201`**
```json
{
  "jobId": "bull:clip-generation:1234",
  "status": "queued"
}
```

> Processing is asynchronous. Listen for WebSocket events on `clip.progress`, `clip.completed`, and `clip.failed`.

---

### List Clips

```http
GET /clips?videoId=42&sort=viralityScore:desc&page=1&limit=20
Authorization: Bearer <accessToken>
```

**Response `200`**
```json
{
  "data": [
    {
      "id": "42-10.5-40.0",
      "videoId": "42",
      "clipUrl": "https://res.cloudinary.com/your-cloud/video/upload/v1234/clip-42-10-40.mp4",
      "thumbnail": "https://res.cloudinary.com/your-cloud/image/upload/v1234/clip-42-10-40.jpg",
      "startTime": 10.5,
      "endTime": 40.0,
      "duration": 30,
      "viralityScore": 0.87,
      "caption": "My YouTube Video — clip 1",
      "status": "success",
      "selected": false,
      "postStatus": null,
      "createdAt": "2026-06-01T12:00:00.000Z"
    }
  ],
  "total": 1,
  "page": 1,
  "limit": 20
}
```

---

### Bulk Update Clips (select / deselect)

```http
POST /clips/bulk-update
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "clipIds": ["42-10.5-40.0", "42-50.0-80.0"],
  "selected": true
}
```

**Response `200`**
```json
{
  "updated": 2,
  "notFoundIds": []
}
```

---

### Bulk Delete Clips

```http
POST /clips/bulk-delete
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "clipIds": ["42-90.0-120.0"]
}
```

**Response `200`**
```json
{
  "deleted": 1
}
```

---

## Wallet Connect

### Connect a Stellar Wallet

```http
POST /wallets/connect
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "address": "GC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3",
  "chain": "stellar",
  "type": "freighter"
}
```

**Response `200`**
```json
{
  "id": 7,
  "userId": 3,
  "address": "******UHTZF3",
  "chain": "stellar",
  "type": "freighter",
  "createdAt": "2026-06-01T12:00:00.000Z"
}
```

> Wallet addresses are masked in all responses — only the last 6 characters are shown.

---

### List Wallets

```http
GET /wallets
Authorization: Bearer <accessToken>
```

**Response `200`**
```json
[
  {
    "id": 7,
    "address": "******UHTZF3",
    "chain": "stellar",
    "type": "freighter",
    "createdAt": "2026-06-01T12:00:00.000Z"
  }
]
```

---

### Disconnect a Wallet

```http
DELETE /wallets/7
Authorization: Bearer <accessToken>
```

**Response `200`**
```json
{
  "message": "Wallet disconnected successfully",
  "walletId": 7
}
```

---

## NFT Minting

### Prepare Mint (get unsigned transaction)

```http
POST /nft/prepare-mint
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "clipId": 101,
  "walletAddress": "GC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3"
}
```

**Response `200`**
```json
{
  "unsignedXdr": "AAAAAgAAAAA...",
  "networkPassphrase": "Test SDF Network ; September 2015"
}
```

---

### Mint a Clip as NFT

```http
POST /clips/101/mint
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "clipId": "42-10.5-40.0",
  "creatorWallet": "GC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3",
  "metadataUri": "ipfs://QmXyz...",
  "royaltyBps": 1000
}
```

**Response `201`**
```json
{
  "transactionHash": "a1b2c3d4e5f6...",
  "nftId": "clip-nft-42-10.5-40.0",
  "metadataUri": "ipfs://QmXyz...",
  "royaltyBps": 1000
}
```

> `royaltyBps` is in basis points: `1000` = 10%. Clips with `postStatus = "posted"` cannot be minted and return `400`.

---

## Payouts

### Request a Payout

```http
POST /payouts
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "amount": 50.00,
  "currency": "USD",
  "method": "stellar"
}
```

**Response `201`**
```json
{
  "id": 15,
  "amount": 50.00,
  "currency": "USD",
  "method": "stellar",
  "status": "pending",
  "createdAt": "2026-06-01T12:00:00.000Z"
}
```

> Returns `400` if `amount` is below `MIN_PAYOUT_USD` (default: 5).

---

## WebSocket Progress Events

Connect to the WebSocket gateway at `ws://localhost:3000` and listen for these events:

### `clip.progress`
```json
{
  "jobId": "bull:clip-generation:1234",
  "videoId": "42",
  "percent": 60,
  "step": "ffmpeg_cut",
  "currentClip": {
    "id": "42-10.5-40.0",
    "startTime": 10.5,
    "endTime": 40.0,
    "positionRatio": 0.15
  }
}
```

### `clip.completed`
```json
{
  "jobId": "bull:clip-generation:1234",
  "videoId": "42",
  "clipId": "42-10.5-40.0",
  "clipUrl": "https://res.cloudinary.com/your-cloud/video/upload/v1234/clip.mp4",
  "thumbnail": "https://res.cloudinary.com/your-cloud/image/upload/v1234/clip.jpg",
  "status": "success"
}
```

### `clip.failed`
```json
{
  "jobId": "bull:clip-generation:1234",
  "videoId": "42",
  "reason": "FFmpeg process exited with code 1",
  "attemptsMade": 5
}
```

---

## Error Responses

All errors follow this shape:

```json
{
  "statusCode": 400,
  "message": "Descriptive error message",
  "error": "Bad Request"
}
```

| Status | Meaning |
|--------|---------|
| `400` | Validation error or business rule violation |
| `401` | Missing or invalid JWT |
| `403` | Forbidden (wrong user or missing role) |
| `404` | Resource not found |
| `429` | Rate limit exceeded |
| `500` | Internal server error |

---

> **Tip:** The full interactive API reference is available at `http://localhost:3000/api/docs` when running in development mode.
