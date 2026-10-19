# Royalty Claim API Documentation

## Overview

The Royalty Claim API allows creators and authorized royalty recipients to query and claim accumulated royalties from NFTs minted on the Soroban network. This implementation addresses GitHub issues #839 and #840.

**Related Issues:**
- #839: Add Royalty Claim Function for Creators
- #840: Paginated royalty claim history for an NFT

## Architecture

### Components

1. **ClaimRoyaltyService** - Core service for querying and preparing royalty claim transactions
2. **RoyaltyQueryService** - Queries on-chain royalty information and splits
3. **RoyaltyClaimHistoryService** - Tracks historical claim records
4. **NftController** - Exposes REST endpoints for royalty operations

### On-Chain Contract Methods

- `claim_royalties(token_id, asset?)` - Claims accumulated royalties for a token
- `get_claimable_royalties(token_id, recipient, asset?)` - Queries claimable balance without claiming
- `get_royalties(token_id)` - Retrieves current royalty split configuration

## API Endpoints

### 1. Get Claimable Royalties (Query Balance)

**Endpoint:** `GET /nfts/:id/claim-royalties`

**Purpose:** Query the current claimable royalty balance for a recipient without making any on-chain changes.

**Authentication:** Required (Bearer JWT token)

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `recipient` | string | No | Royalty recipient wallet address (defaults to authenticated user's wallet) |
| `assetContractId` | string | No | Soroban Asset Contract (SAC) address. Defaults to native XLM. |

**Request Example:**

```bash
curl -X GET \
  "https://api.example.com/nfts/42/claim-royalties?recipient=GC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3&assetContractId=CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

**Success Response (200 OK):**

```json
{
  "tokenId": 42,
  "recipient": "GC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3",
  "claimableBalance": 5000000,
  "claimableAmount": 50.0,
  "asset": "native",
  "canClaim": true,
  "network": "testnet"
}
```

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `tokenId` | integer | The NFT token ID |
| `recipient` | string | The royalty recipient wallet address |
| `claimableBalance` | integer | Balance in stroops (smallest XLM unit; 1 XLM = 10,000,000 stroops) |
| `claimableAmount` | number | Balance in XLM or other asset |
| `asset` | string | Asset identifier (`native` for XLM or SAC contract ID) |
| `canClaim` | boolean | Whether the balance is non-zero and can be claimed |
| `network` | string | Stellar network (`testnet`, `mainnet`, etc.) |

**Error Responses:**

| Status | Error | Reason |
|--------|-------|--------|
| **400** | `BadRequestException` | Invalid token ID or wallet address format |
| **401** | `UnauthorizedException` | Missing or invalid JWT token |
| **404** | `NotFoundException` | Token not found or no royalty data |
| **503** | `ServiceUnavailableException` | Soroban RPC circuit breaker is open (temporary outage) |

**Error Response Example (400):**

```json
{
  "statusCode": 400,
  "message": "Invalid wallet address: not-a-stellar-address",
  "error": "Bad Request"
}
```

---

### 2. Prepare Royalty Claim Transaction

**Endpoint:** `POST /nfts/:id/claim-royalties`

**Purpose:** Build an unsigned Soroban transaction that claims accumulated royalties. The returned XDR must be signed by the recipient's wallet and submitted to the network.

**Authentication:** Required (Bearer JWT token)

**Request Body:**

```json
{
  "walletAddress": "GC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3",
  "assetContractId": "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA"
}
```

**Request Fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `walletAddress` | string | Yes | Recipient's Stellar wallet address |
| `assetContractId` | string | No | Soroban Asset Contract address. Defaults to native XLM. |

**Request Example:**

```bash
curl -X POST \
  "https://api.example.com/nfts/42/claim-royalties" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -d '{
    "walletAddress": "GC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3"
  }'
```

**Success Response (200 OK):**

```json
{
  "tokenId": 42,
  "xdr": "AAAAAgAAAABbxulHkwI6mW6yJ0V9yIyHKu...[truncated base64 XDR]...AAAA",
  "recipient": "GC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3",
  "claimableBalance": 5000000,
  "contractId": "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEU4",
  "network": "testnet"
}
```

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `tokenId` | integer | The NFT token ID |
| `xdr` | string | Unsigned Soroban transaction XDR (base64-encoded) |
| `recipient` | string | Royalty recipient wallet address |
| `claimableBalance` | integer | Amount being claimed (in stroops) |
| `contractId` | string | Soroban NFT contract address |
| `network` | string | Stellar network identifier |

**Frontend Implementation Steps:**

1. Call `GET /nfts/:id/claim-royalties` to verify available balance
2. Call `POST /nfts/:id/claim-royalties` to get the unsigned XDR
3. Sign the XDR with the recipient's private key using Stellar SDK:
   ```javascript
   const signedTx = tx.sign(keypair);
   ```
4. Submit the signed transaction to the Stellar network:
   ```javascript
   await server.submitTransaction(signedTx);
   ```

**Error Responses:**

| Status | Error | Reason |
|--------|-------|--------|
| **400** | `BadRequestException` | No claimable royalties, invalid wallet address, or clip not yet minted |
| **401** | `UnauthorizedException` | Missing or invalid JWT token |
| **403** | `ForbiddenException` | Caller does not own the clip or is not authorized to claim |
| **404** | `NotFoundException` | Clip not found |
| **409** | `ConflictException` | Token not yet minted or contract deployment pending |
| **503** | `ServiceUnavailableException` | Soroban RPC temporarily unavailable (circuit breaker open) |

**Error Response Example (400 - No Claimable Balance):**

```json
{
  "statusCode": 400,
  "message": "No claimable royalties for token 42",
  "error": "Bad Request"
}
```

**Error Response Example (403 - Unauthorized):**

```json
{
  "statusCode": 403,
  "message": "Not authorized to claim royalties for this token",
  "error": "Forbidden"
}
```

---

### 3. Get Royalty Split Configuration

**Endpoint:** `GET /nfts/:id/royalties`

**Purpose:** Retrieve the complete multi-recipient royalty split for an NFT.

**Authentication:** Not required

**Response:**

```json
{
  "tokenId": 42,
  "shares": [
    {
      "recipient": "GC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3",
      "bps": 7500
    },
    {
      "recipient": "GAUCTR43QBKC5KZGVN6DFSRHVDBGBNJ7OEBLCYWWZ4LAP5BF5SXDDZP",
      "bps": 2500
    }
  ],
  "totalBps": 10000
}
```

---

### 4. Get Royalty Claim History

**Endpoint:** `GET /nfts/:id/royalties/history`

**Purpose:** Retrieve paginated history of royalty claims for an NFT.

**Authentication:** Not required

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | integer | 1 | Page number (1-indexed) |
| `limit` | integer | 50 | Results per page (max 500) |

**Response:**

```json
{
  "tokenId": 42,
  "claims": [
    {
      "claimId": "claim-42-001",
      "claimant": "GC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3",
      "amount": 5000000,
      "asset": "native",
      "txHash": "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
      "claimedAt": "2026-09-28T15:30:00Z",
      "status": "confirmed"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 142,
    "pages": 3
  }
}
```

---

## Authorization & Security

### Authentication

All endpoints require JWT Bearer token authentication (except GET /nfts/:id/royalties and GET /nfts/:id/royalties/history):

```
Authorization: Bearer <jwt_token>
```

### Authorization Checks

1. **Clip Ownership:** The authenticated user must own the clip/NFT token
2. **Claimant Verification:** The wallet address must be authorized as a royalty recipient
3. **Address Validation:** All wallet addresses are strictly validated against Stellar address format

### Multi-Recipient Authorization

For multi-recipient royalty configurations, any recipient can claim their allocated share:

```javascript
// Example: Multiple recipients can each claim their portion
const tokenId = 42;

// Creator's share (7500 BPS = 75%)
await claimRoyalties(tokenId, creatorWallet);

// Platform's share (2500 BPS = 25%)
await claimRoyalties(tokenId, platformWallet);
```

---

## Implementation Details

### On-Chain Behavior

1. **Balance Query** (`get_claimable_royalties`):
   - Returns accumulated royalties for a specific recipient
   - Non-destructive read operation
   - Does not modify contract state

2. **Claim Execution** (`claim_royalties`):
   - Transfers the full accrued amount to the recipient
   - Resets the accrued balance to zero (preventing double claims)
   - Emits `RoyaltyClaimed` event with:
     - `token_id`: NFT token ID
     - `recipient`: Claiming wallet address
     - `amount`: Claimed amount (in stroops)
     - `asset`: Asset claimed (native or SAC contract)

### Circuit Breaker Protection

All Soroban RPC calls are protected by a circuit breaker with these settings:

| Setting | Value | Purpose |
|---------|-------|---------|
| Failure Threshold | 5 consecutive failures | Trips circuit after 5 RPC failures |
| Recovery Timeout | 30 seconds | Time before attempting recovery |
| Sampling Duration | 60 seconds | Window for counting failures |

When the circuit is open, API returns **503 Service Unavailable**.

### Caching

- Query responses are **not cached** for real-time accuracy
- Claim history is cached for 5 minutes
- Cache invalidated on new claim events

---

## Error Handling

### Common Error Scenarios

#### No Claimable Balance (400)

```json
{
  "statusCode": 400,
  "message": "No claimable royalties for token 42",
  "error": "Bad Request"
}
```

**Resolution:** Query `GET /nfts/:id/claim-royalties` to verify available balance. Balance must be > 0 to claim.

#### Invalid Wallet Address (400)

```json
{
  "statusCode": 400,
  "message": "Invalid wallet address: not-a-stellar-address",
  "error": "Bad Request"
}
```

**Resolution:** Use a valid Stellar public key (starts with 'G', 48 characters).

#### Unauthorized Claimant (403)

```json
{
  "statusCode": 403,
  "message": "Not authorized to claim royalties for this token",
  "error": "Forbidden"
}
```

**Resolution:** Only royalty recipients configured for this token can claim. Check the royalty split with `GET /nfts/:id/royalties`.

#### Token Not Found (404)

```json
{
  "statusCode": 404,
  "message": "Clip 999 not found",
  "error": "Not Found"
}
```

**Resolution:** Verify the token ID is correct and the NFT has been minted.

#### Service Unavailable (503)

```json
{
  "statusCode": 503,
  "message": "Soroban RPC temporarily unavailable. Please try again later.",
  "error": "Service Unavailable"
}
```

**Resolution:** Soroban RPC is experiencing issues. Retry after 30-60 seconds.

---

## Usage Examples

### Example 1: Check Available Royalties

```bash
#!/bin/bash

TOKEN_ID=42
RECIPIENT="GC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3"
JWT_TOKEN="your-jwt-token"

curl -X GET \
  "https://api.example.com/nfts/$TOKEN_ID/claim-royalties?recipient=$RECIPIENT" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json"
```

### Example 2: Claim Royalties (Complete Flow)

```javascript
// 1. Check balance
const balanceResponse = await fetch(
  `https://api.example.com/nfts/42/claim-royalties?recipient=${walletAddress}`,
  {
    method: 'GET',
    headers: { Authorization: `Bearer ${jwtToken}` }
  }
);

const balance = await balanceResponse.json();
console.log(`Available: ${balance.claimableAmount} ${balance.asset}`);

// 2. Prepare claim transaction
const claimResponse = await fetch(
  `https://api.example.com/nfts/42/claim-royalties`,
  {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${jwtToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      walletAddress: walletAddress
    })
  }
);

const { xdr } = await claimResponse.json();

// 3. Sign with Stellar SDK
const StellarSdk = require('@stellar/stellar-sdk');
const keypair = StellarSdk.Keypair.fromSecret(userSecret);
const tx = StellarSdk.TransactionBuilder.fromXDR(
  xdr,
  'Test SDF Network ; September 2015'
);
const signedTx = tx.sign(keypair);

// 4. Submit to network
const server = new StellarSdk.rpc.Server('https://soroban-testnet.stellar.org');
const result = await server.submitTransaction(signedTx);
console.log('Claim submitted:', result.id);
```

### Example 3: Multi-Recipient Royalty Claim

```javascript
// Token 42 has two royalty recipients
const royalties = await fetch(
  `https://api.example.com/nfts/42/royalties`
).then(r => r.json());

console.log(royalties.shares);
// Output:
// [
//   { recipient: "CREATOR_ADDRESS", bps: 7500 },
//   { recipient: "PLATFORM_ADDRESS", bps: 2500 }
// ]

// Each can claim their share independently
for (const share of royalties.shares) {
  const claimXdr = await prepareClaimForRecipient(42, share.recipient);
  // Sign and submit with each recipient's key
}
```

---

## Testing

### Running Tests

```bash
# Run all royalty claim tests
npm run test -- test/claim-royalties.e2e-spec.ts

# Run specific test suite
npm run test -- test/claim-royalties.e2e-spec.ts --testNamePattern="Zero-Balance Prevention"

# Run with contract integration (requires testnet)
npm run test:contract -- test/claim-royalties.e2e-spec.ts
```

### Test Coverage

- ✅ Query claimable balance with valid parameters
- ✅ Handle zero-balance scenarios
- ✅ Verify authorization checks
- ✅ Validate wallet address formats
- ✅ Prevent double claims
- ✅ Transaction XDR structure validation
- ✅ Multi-asset support
- ✅ Circuit breaker protection
- ✅ Error response formatting

---

## Migration & Rollout

### Phase 1: Development
- ✅ Implement core functionality
- ✅ Add comprehensive tests
- ✅ Security review

### Phase 2: Testnet
- Deploy to Soroban testnet
- Run load testing
- Verify with test creators

### Phase 3: Mainnet
- Deploy to mainnet with monitoring
- Enable gradual rollout
- Monitor event emission

---

## Related Documentation

- [Soroban Configuration](./stellar-configuration.md)
- [Safe Math](./safe-math.md)
- [Error Codes](./error-codes.md)
- [Wallet Integration](./wallet-integration.md)
- [API Contract](./api-contract.md)
