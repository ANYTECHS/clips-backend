# Stellar Wallet Integration Flow

## Overview

This document covers the complete flow from wallet connection through NFT minting on Soroban, including frontend, backend, and blockchain interactions.

---

## High-Level Architecture

```
┌──────────────┐
│   Frontend   │
│  (React)     │
└──────┬───────┘
       │ (1) Connect wallet
       │ (2) Get public key
       ▼
┌──────────────────────────┐
│  Wallet Provider         │
│  (Stellar Lab, Albedo)   │
└──────┬───────────────────┘
       │ (3) Return account
       │     (pubkey, balance)
       ▼
┌──────────────────────────────┐
│    Backend API               │
│  (NestJS + Prisma)           │
│                              │
│ ├─ POST /wallet/connect      │
│ ├─ GET /wallet/balance       │
│ ├─ POST /clips/:id/mint      │
│ └─ POST /clips/:id/mint/confirm
└──────┬───────────────────────┘
       │ (4) Prepare TX
       │ (5) Return XDR
       ▼
┌──────────────────────────────┐
│  Frontend (Sign with Wallet) │
│                              │
│ - Show TX preview           │
│ - User approves             │
│ - Sign with wallet secret   │
└──────┬───────────────────────┘
       │ (6) Submit signed TX
       ▼
┌──────────────────────────────┐
│  Stellar Soroban RPC        │
│                              │
│ - Invoke contract function   │
│ - Mint NFT                   │
│ - Update contract state      │
└──────┬───────────────────────┘
       │ (7) Ledger confirmation
       ▼
┌──────────────────────────────┐
│  Backend (Poll + Update DB)  │
│                              │
│ - Fetch TX result           │
│ - Extract mint address      │
│ - Update clip.nftStatus     │
│ - Store metadata URI        │
└──────────────────────────────┘
```

---

## Detailed Flow

### Phase 1: Wallet Connection (Frontend)

**User initiates connection:**

1. User clicks "Connect Stellar Wallet" button
2. Frontend calls wallet provider API (e.g., Freighter):
   ```ts
   const publicKey = await window.stellar.requestPublicKey();
   ```
3. Frontend receives wallet account address (e.g., `GXXXXX...`)
4. Frontend stores in session/local state

### Phase 2: Register Wallet (Frontend → Backend)

**Frontend sends wallet to backend:**

```
POST /wallets/connect
{
  "stellarPublicKey": "GXXXXX...",
  "walletType": "freighter"  // or "albedo", "stellar_lab"
}
```

**Backend:**
- Validates Stellar public key format
- Creates or updates `Wallet` record in database
- Links wallet to authenticated user

**Response:**
```json
{
  "id": 123,
  "userId": 456,
  "stellarPublicKey": "GXXXXX...",
  "walletType": "freighter",
  "connected": true,
  "createdAt": "2024-06-12T10:00:00Z"
}
```

### Phase 3: Initiate Mint (Frontend → Backend)

**User clicks "Mint as NFT" on a clip:**

```
POST /clips/:clipId/mint
{
  "walletAddress": "GXXXXX...",
  "royaltyBps": 500  // 5% royalty
}
```

**Backend:**
1. Validate clip exists and belongs to user
2. Check wallet is connected and authorized
3. Enqueue job to `nft-mint` BullMQ queue
4. Return job ID and preview of transaction

**Response:**
```json
{
  "jobId": "abc123def456",
  "status": "pending",
  "message": "Preparing transaction, please wait..."
}
```

### Phase 4: Prepare Soroban Transaction (Backend)

**NftMintProcessor runs (`src/clips/nft-mint.processor.ts`):**

```
NftMintProcessor
  │
  ├─ Fetch clip metadata
  ├─ Fetch NFT contract address (from env/config)
  ├─ Build Soroban contract invocation:
  │   - Function: `mint_nft()`
  │   - Args:
  │      - to: wallet address
  │      - metadata_uri: IPFS CID or external URL
  │      - royalty_bps: royalty basis points
  ├─ Build Stellar TransactionBuilder:
  │   - Network: Stellar Testnet or Mainnet
  │   - Source account: Backend service account
  │   - Fee: ~100 stroops
  │   - Timeout: 30 minutes
  │   - Operation: RPC invoke contract
  │
  └─ Return unsigned XDR (transaction envelope)
```

**Response to Frontend (via WebSocket or polling):**

```json
{
  "jobId": "abc123def456",
  "status": "ready_to_sign",
  "transactionXdr": "AAAAAgAAAABwDa0h...",
  "contractId": "CXXXXXX...",
  "message": "Transaction ready. Please sign in your wallet."
}
```

### Phase 5: Sign Transaction (Frontend + Wallet)

**Frontend:**

1. Displays transaction preview to user:
   ```
   Chain: Stellar Testnet
   Operation: Invoke Contract
   Network Fee: 100 stroops (~$0.00001)
   Authorize Transaction: YES / NO
   ```

2. User approves
3. Frontend calls wallet API to sign:
   ```ts
   const signedXdr = await window.stellar.signTransaction(transactionXdr, {
     network: StellarSDK.Networks.TESTNET_NETWORK_PASSPHRASE
   });
   ```

4. Frontend receives **signed XDR** (transaction envelope with signatures)
5. Frontend submits signed XDR to backend

### Phase 6: Submit to Soroban Network (Frontend → Backend)

**Frontend submits signed transaction:**

```
POST /clips/:clipId/mint/confirm
{
  "jobId": "abc123def456",
  "signedXdr": "AAAAAgAAAABwDa0h...[SIGNATURE]..."
}
```

**Backend:**
1. Validate signed XDR signature
2. Submit to Stellar Soroban RPC:
   ```ts
   const response = await sorobanClient.sendTransaction(signedXdr);
   ```
3. Receive `hash` and `status` (pending/success/error)
4. Return immediately or start polling for confirmation

**Response:**
```json
{
  "transactionHash": "abc123def456xyz",
  "status": "pending",
  "message": "Submitted to network. Waiting for confirmation...",
  "pollingUrl": "/clips/:clipId/mint/status?hash=abc123def456xyz"
}
```

### Phase 7: Confirm Mint (Backend Polling)

**Backend polls Soroban for confirmation:**

```ts
// src/clips/nft-mint.processor.ts
while (notConfirmed) {
  const txResult = await sorobanClient.getTransaction(transactionHash);
  if (txResult.status === 'SUCCESS') {
    // Extract result from TX
    // Find mint address from contract state or event log
    break;
  }
  if (txResult.status === 'FAILED') {
    throw new Error(`TX failed: ${txResult.error}`);
  }
  await sleep(2000);  // Poll every 2 seconds
}
```

**Once confirmed:**
1. Extract mint address from transaction result
2. Update clip in database:
   ```ts
   await prisma.clip.update({
     where: { id: clipId },
     data: {
       nftStatus: 'minted',
       mintAddress: '0xABC123...',
       metadataUri: 'ipfs://QmABC...',
       mintedAt: new Date()
     }
   });
   ```
3. Emit WebSocket event to frontend: `clip:nft:minted`

**Frontend (via WebSocket or polling):**
```json
{
  "event": "clip:nft:minted",
  "clipId": 123,
  "mintAddress": "0xABC123...",
  "metadataUri": "ipfs://QmABC...",
  "message": "Successfully minted! View on explorer."
}
```

---

## Data Models

### User Wallet (Database)

```ts
model Wallet {
  id                    Int     @id @default(autoincrement())
  userId                Int
  stellarPublicKey      String  @unique
  walletType            String  // "freighter", "albedo", "stellar_lab"
  encryptedStellarSecret String? // Optional: for backend-initiated txs
  createdAt             DateTime @default(now())
  user                  User    @relation(fields: [userId], references: [id])
}
```

### Clip NFT Status (Database)

```ts
model Clip {
  id              Int     @id @default(autoincrement())
  // ... other fields
  nftStatus       String  @default("none")  // "none", "pending", "minted", "failed"
  mintAddress     String? @unique           // e.g., "CXXXXX..."
  metadataUri     String?                   // e.g., "ipfs://QmABC..."
  mintedAt        DateTime?
}
```

---

## Key Configuration

**Environment Variables:**

| Variable | Example | Description |
|----------|---------|-------------|
| `SOROBAN_RPC_URL` | `https://soroban-testnet.stellar.org` | Soroban RPC endpoint |
| `SOROBAN_NETWORK` | `testnet` or `mainnet` | Stellar network |
| `NFT_CONTRACT_ID` | `CXXXXXX...` | Deployed NFT contract address |
| `SERVICE_ACCOUNT_SECRET` | `SXXXXXX...` | Backend service account for signing |

---

## Wallet Providers

### Supported Wallets

| Wallet | Website | Integration |
|--------|---------|-------------|
| Freighter | https://freighter.app | `window.stellar.requestPublicKey()` |
| Albedo | https://albedo.link | `albedo.publicKey()` |
| Stellar Lab | https://lab.stellar.org | Manual XDR submission |

All providers follow Stellar Web Standards and return public keys in the same format.

---

## Error Handling

### Common Errors and Recovery

**Error: "User rejected transaction"**
- User clicked "Cancel" in wallet provider
- Frontend retries with fresh `POST /clips/:id/mint`

**Error: "Circuit breaker open - Soroban RPC unavailable"**
- Soroban RPC is down or rate-limited
- Backend returns HTTP 503
- Frontend shows: "Service temporarily unavailable. Try again in 30 seconds."
- Auto-retry after 30 seconds

**Error: "Insufficient funds"**
- User's Stellar account has no XLM for fee
- Frontend shows: "Add XLM to your account and try again"
- User deposits XLM via exchange

**Error: "Signature verification failed"**
- Frontend signed with wrong key
- Tx rejected by Soroban
- Frontend retries mint flow

---

## Security Considerations

1. **Never store private keys on backend** — always use frontend wallets
2. **Validate wallet addresses** — reject malformed Stellar addresses
3. **Rate limit mint requests** — prevent spam (max 5 mints/hour per user)
4. **Verify transaction XDR** — check contract and args match expected values
5. **Use Stellar Test Network for development** — never point to Mainnet in dev
6. **Rotate service account keys** — backend's Soroban signing key

---

## Testing Locally

### Setup

1. Use Stellar Testnet (default)
2. Install wallet extension (Freighter or Albedo)
3. Create test account via [Stellar Friendbot](https://developers.stellar.org/docs/tutorials/create-account)
4. Fund test account with testnet lumens

### Test Mint Flow

```bash
# Start backend
npm run start:dev

# In browser dev console
await fetch('http://localhost:3000/wallets/connect', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    stellarPublicKey: 'GXXXXX...',
    walletType: 'freighter'
  })
});

# Then click "Mint NFT" in UI
```

---

## Useful Resources

- [Stellar Soroban Docs](https://developers.stellar.org/docs/learn/soroban)
- [Stellar SDK TypeScript](https://github.com/stellar/js-stellar-sdk)
- [Stellar Web Standards](https://github.com/stellar/stellar-protocol/blob/master/core/cap-0046-01.md)
- [Freighter Documentation](https://docs.freighter.app/)
- [Soroban Contract Explorer](https://soroban.stellar.org/explorer)
