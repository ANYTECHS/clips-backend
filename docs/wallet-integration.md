# Wallet Integration

> **GitHub Issue:** #853  
> **Last Updated:** 2026-08-29  
> **Status:** Active

This document covers the full wallet integration layer for ClipCash: how users connect wallets from multiple chains, how signatures are verified, how the minting flow works end-to-end, and the complete API reference with example payloads.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Supported Chains and Wallet Providers](#2-supported-chains-and-wallet-providers)
3. [Wallet Address Validation Rules](#3-wallet-address-validation-rules)
4. [Wallet Connection Flow](#4-wallet-connection-flow)
5. [Signature Verification and Authentication](#5-signature-verification-and-authentication)
6. [NFT Minting Flow](#6-nft-minting-flow)
7. [Transaction Signing — Freighter and Albedo](#7-transaction-signing--freighter-and-albedo)
8. [Transaction Confirmation and Status Polling](#8-transaction-confirmation-and-status-polling)
9. [Address Masking](#9-address-masking)
10. [Balance Checks and Warnings](#10-balance-checks-and-warnings)
11. [Environment Variables](#11-environment-variables)
12. [API Endpoint Reference](#12-api-endpoint-reference)
13. [Error Reference](#13-error-reference)
14. [Security Considerations](#14-security-considerations)

---

## 1. Architecture Overview

ClipCash supports a multi-chain wallet layer that lets users authenticate with a cryptographic wallet, hold assets, and optionally mint their best clips as NFTs on the Stellar network.

```
┌───────────────────────────────────────────────────────────────────────────┐
│                         Browser / Frontend (Next.js)                      │
│                                                                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐  │
│  │  Freighter   │  │    Albedo    │  │   MetaMask   │  │   Phantom   │  │
│  │  (Stellar)   │  │  (Stellar)   │  │   (EVM)      │  │  (Solana)   │  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬──────┘  │
│         └─────────────────┴─────────────────┴─────────────────┘         │
│                                    │                                      │
│              sign message / sign XDR transaction                          │
│                                    │                                      │
└───────────────────────────────────┬───────────────────────────────────────┘
                                    │ HTTPS
                                    ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                      ClipCash Backend API (NestJS)                        │
│                                                                           │
│   POST /wallets/connect      ← verify signature, persist wallet record   │
│   GET  /wallets              ← list wallets (masked addresses)            │
│   GET  /wallets/:id/balance  ← fetch on-chain balance via Stellar SDK     │
│   POST /clips/:id/mint-prepare  ← build unsigned Soroban XDR             │
│   POST /clips/:id/mint-confirm  ← submit signed XDR to Soroban RPC       │
│   GET  /transactions/:hash/status ← poll transaction result               │
│                                                                           │
│  ┌──────────────────────────────────────────────────────────────────┐    │
│  │  WalletService     StellarService     NftMintService              │    │
│  │  - validateAddress  - buildMintTx      - uploadIPFSMetadata       │    │
│  │  - verifySig        - submitTx         - storeMintTxHash          │    │
│  │  - maskAddress      - pollStatus       - checkPostStatus guard    │    │
│  └──────────────────────────────────────────────────────────────────┘    │
│                              │                    │                       │
└──────────────────────────────┼────────────────────┼───────────────────────┘
                               │                    │
               ┌───────────────┘                    └──────────────────┐
               │                                                        │
               ▼                                                        ▼
┌──────────────────────────┐                          ┌────────────────────────┐
│   Soroban RPC Endpoint   │                          │   Pinata (IPFS)        │
│                          │                          │                        │
│  testnet:                │                          │  Upload NFT metadata   │
│  soroban-testnet.        │                          │  JSON before minting   │
│  stellar.org             │                          │                        │
│                          │                          │  Returns ipfs://...    │
│  mainnet:                │                          │  CID used in XDR       │
│  soroban-rpc.stellar.org │                          └────────────────────────┘
└──────────┬───────────────┘
           │
           ▼
┌──────────────────────────┐
│   Stellar Network        │
│                          │
│  Testnet or Mainnet      │
│  (set via               │
│  STELLAR_NETWORK env)    │
│                          │
│  NFT ownership recorded  │
│  in Soroban contract     │
│  SOROBAN_NFT_CONTRACT_ID │
└──────────────────────────┘
```

### Key Design Decisions

- **No private keys on the server.** All transaction signing happens in the user's browser using their own wallet extension (Freighter, Albedo, MetaMask, Phantom). The backend only builds unsigned transactions and submits already-signed ones.
- **Signature-based authentication.** Connecting a wallet requires signing a timestamped message so the server can verify the user truly controls the address — no passwords needed.
- **Multi-chain, single model.** Stellar, Solana, and EVM wallets all use the same `Wallet` database record with a `chain` discriminator.
- **Address masking.** Raw wallet addresses are never returned in full from the API to reduce accidental exposure in logs, UIs, or third-party integrations.

---

## 2. Supported Chains and Wallet Providers

| Chain | Chain ID (API) | Supported Wallet Providers |
|---|---|---|
| Stellar | `stellar` | Freighter, Lobstr, Albedo |
| Solana | `solana` | Phantom, Solflare, Backpack |
| Base (EVM) | `base` | MetaMask, Coinbase Wallet, WalletConnect |
| Ethereum (EVM) | `ethereum` | MetaMask, Coinbase Wallet, WalletConnect |

> **Primary chain for NFT minting:** `stellar`. Only Stellar wallets can be used to mint clips as NFTs via Soroban smart contracts. Solana and EVM wallets are supported for identity verification and future multi-chain payout features.

### Wallet Type Values

The `type` field in `POST /wallets/connect` accepts the following string values:

| Type Value | Provider | Chain |
|---|---|---|
| `freighter` | Freighter browser extension | stellar |
| `albedo` | Albedo web signer | stellar |
| `lobstr` | Lobstr mobile / extension | stellar |
| `phantom` | Phantom browser extension | solana |
| `solflare` | Solflare browser extension | solana |
| `backpack` | Backpack browser extension | solana |
| `metamask` | MetaMask browser extension | base / ethereum |
| `coinbase` | Coinbase Wallet | base / ethereum |
| `walletconnect` | WalletConnect protocol | base / ethereum |

---

## 3. Wallet Address Validation Rules

Before persisting a wallet or verifying any signature, the backend validates the address format against the declared chain.

### 3.1 Stellar

- **Format:** StrKey-encoded Ed25519 public key
- **Prefix:** Always starts with `G`
- **Length:** Exactly 56 characters
- **Character set:** Base32 alphabet (`A–Z`, `2–7`)
- **Regex:** `/^G[A-Z2-7]{55}$/`

**Valid example:**
```
GAHJJJKMOKYE4RVPZEWZTKH5FVI4PA3VL7GK2LFNUBSGBV3RPVMVP5QQ
```

**Invalid examples:**
```
gahjjjkmokye...   ← lowercase prefix
XAHJJJKMOKY...   ← wrong prefix letter
GABC123!@#...     ← invalid characters
GABC...           ← too short
```

### 3.2 Solana

- **Format:** Base58-encoded 32-byte Ed25519 public key
- **Length:** 32 to 44 characters (variable due to Base58 encoding)
- **Character set:** Base58 alphabet (alphanumeric, excluding `0`, `O`, `I`, `l`)
- **Regex:** `/^[1-9A-HJ-NP-Za-km-z]{32,44}$/`

**Valid example:**
```
7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgHkv
```

### 3.3 EVM / Base / Ethereum

- **Format:** Hex-encoded 20-byte Ethereum address
- **Prefix:** Always starts with `0x`
- **Length:** `0x` + exactly 40 hex characters = 42 characters total
- **Character set:** Hex digits (`0–9`, `a–f`, `A–F`) — EIP-55 mixed-case checksum is accepted but not required
- **Regex:** `/^0x[0-9a-fA-F]{40}$/`

**Valid examples:**
```
0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045   ← EIP-55 checksummed
0xd8da6bf26964af9d7eed9e03e53415d37aa96045   ← lowercase, also valid
```

### 3.4 Validation Error Response

When address validation fails, the API returns:

```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": "Invalid Stellar address format. Expected G-prefix, 56-character Base32 string.",
  "code": "WALLET_INVALID_ADDRESS"
}
```

---

## 4. Wallet Connection Flow

Connecting a wallet is a two-step process handled entirely by `POST /wallets/connect`. No separate "initiate challenge" step is needed because the frontend constructs the message deterministically using the current Unix timestamp.

```
Frontend                              Backend (NestJS)
   │                                       │
   │  1. User clicks "Connect Wallet"      │
   │                                       │
   │  2. Get public key from wallet ext.   │
   │     (freighter.getPublicKey() etc.)   │
   │                                       │
   │  3. Build sign message:               │
   │     "Connect ClipCash wallet          │
   │      {unix_timestamp_seconds}"        │
   │                                       │
   │  4. Request user to sign message      │
   │     (wallet popup appears)            │
   │                                       │
   │  5. User approves → receive signature │
   │                                       │
   │──── POST /wallets/connect ───────────▶│
   │     { publicKey, signature,           │
   │       signedMessage, chain, type }    │
   │                                       │
   │                                       │  6. Validate address format
   │                                       │  7. Verify signature matches
   │                                       │     publicKey + signedMessage
   │                                       │  8. Check timestamp freshness
   │                                       │     (reject if > 5 min old)
   │                                       │  9. Upsert Wallet record in DB
   │                                       │     (link to authenticated user)
   │                                       │
   │◀─── 201 Created ─────────────────────│
   │     { id, maskedAddress, chain, type }│
   │                                       │
```

### Signed Message Format

```
Connect ClipCash wallet {unix_timestamp_seconds}
```

**Example:**
```
Connect ClipCash wallet 1756484785
```

Where `1756484785` is `Math.floor(Date.now() / 1000)` at connection time.

The backend rejects connections where the embedded timestamp is older than **300 seconds (5 minutes)** to prevent replay attacks.

### Frontend Code Example (Freighter)

```typescript
import * as freighter from '@stellar/freighter-api';

async function connectFreighterWallet(): Promise<WalletConnectPayload> {
  // 1. Check Freighter is installed
  const isAvailable = await freighter.isConnected();
  if (!isAvailable) {
    throw new Error('Freighter extension not found. Please install it.');
  }

  // 2. Request public key (prompts user to allow access if first time)
  const publicKey = await freighter.getPublicKey();

  // 3. Build the deterministic sign message
  const timestamp = Math.floor(Date.now() / 1000);
  const signedMessage = `Connect ClipCash wallet ${timestamp}`;

  // 4. Sign the message (Freighter signs the raw string)
  const { signature } = await freighter.signMessage(signedMessage, {
    networkPassphrase: 'Test SDF Network ; September 2015', // or mainnet passphrase
  });

  return {
    publicKey,
    signature,
    signedMessage,
    chain: 'stellar',
    type: 'freighter',
  };
}
```

### Frontend Code Example (Albedo)

```typescript
import albedo from '@albedo-link/intent';

async function connectAlbedoWallet(): Promise<WalletConnectPayload> {
  const timestamp = Math.floor(Date.now() / 1000);
  const signedMessage = `Connect ClipCash wallet ${timestamp}`;

  // Albedo's publicKey intent returns both key and signature
  const result = await albedo.publicKey({
    token: signedMessage, // Albedo signs this token
  });

  return {
    publicKey: result.pubkey,
    signature: result.signature,
    signedMessage,
    chain: 'stellar',
    type: 'albedo',
  };
}
```

---

## 5. Signature Verification and Authentication

The backend verifies the provided `signature` is a valid Ed25519 signature over `signedMessage` by `publicKey`.

### Stellar Signature Verification

Stellar uses Ed25519 under the hood. The backend uses the `@stellar/stellar-sdk` to verify:

```typescript
import { Keypair } from '@stellar/stellar-sdk';
import * as nacl from 'tweetnacl';

function verifyStellarSignature(
  publicKey: string,
  signedMessage: string,
  signature: string,
): boolean {
  try {
    const keypair = Keypair.fromPublicKey(publicKey);
    const messageBuffer = Buffer.from(signedMessage, 'utf-8');
    const signatureBuffer = Buffer.from(signature, 'base64');
    return keypair.verify(messageBuffer, signatureBuffer);
  } catch {
    return false;
  }
}
```

### EVM Signature Verification

For MetaMask and other EVM wallets, `personal_sign` produces an EIP-191 prefixed signature. The backend recovers the signer address:

```typescript
import { ethers } from 'ethers';

function verifyEvmSignature(
  address: string,
  signedMessage: string,
  signature: string,
): boolean {
  try {
    const recovered = ethers.verifyMessage(signedMessage, signature);
    return recovered.toLowerCase() === address.toLowerCase();
  } catch {
    return false;
  }
}
```

### Solana Signature Verification

Phantom and other Solana wallets sign raw bytes. The backend uses `@solana/web3.js`:

```typescript
import { PublicKey } from '@solana/web3.js';
import nacl from 'tweetnacl';

function verifySolanaSignature(
  publicKey: string,
  signedMessage: string,
  signature: string,
): boolean {
  try {
    const pubkeyBuffer = new PublicKey(publicKey).toBytes();
    const messageBuffer = Buffer.from(signedMessage, 'utf-8');
    const signatureBuffer = Buffer.from(signature, 'base64');
    return nacl.sign.detached.verify(messageBuffer, signatureBuffer, pubkeyBuffer);
  } catch {
    return false;
  }
}
```

### Timestamp Freshness Check

After signature verification succeeds, the backend extracts the timestamp from `signedMessage` and rejects stale connections:

```typescript
function extractAndValidateTimestamp(signedMessage: string): void {
  // signedMessage format: "Connect ClipCash wallet 1756484785"
  const parts = signedMessage.split(' ');
  const timestamp = parseInt(parts[parts.length - 1], 10);
  const now = Math.floor(Date.now() / 1000);

  if (isNaN(timestamp) || Math.abs(now - timestamp) > 300) {
    throw new BadRequestException(
      'Wallet connection request expired. Please try again.',
    );
  }
}
```

---

## 6. NFT Minting Flow

Only Stellar wallets can mint clips as NFTs. The minting process is split into two API calls to keep private keys out of the server.

### Prerequisites

Before initiating a mint:

1. The clip must exist and belong to the authenticated user.
2. `clip.postStatus` must **not** be `"posted"`. Auto-posted clips cannot be minted (returns `400`).
3. The user must have a connected Stellar wallet.
4. The wallet must have sufficient XLM balance (minimum 2 XLM recommended; a warning is issued if below threshold but the request is not blocked at prepare time).

### Minting Sequence Diagram

```
Frontend                    Backend API               Pinata (IPFS)       Soroban RPC
   │                             │                         │                    │
   │── POST /clips/:id/          │                         │                    │
   │   mint-prepare ────────────▶│                         │                    │
   │                             │                         │                    │
   │                             │── Upload NFT metadata ─▶│                    │
   │                             │   { title, description, │                    │
   │                             │     clipUrl, royaltyBps }│                   │
   │                             │                         │                    │
   │                             │◀── ipfs://Qm... CID ────│                    │
   │                             │                         │                    │
   │                             │── Build unsigned        │                    │
   │                             │   Soroban XDR           │                    │
   │                             │   (invokeContract)      │                    │
   │                             │                         │                    │
   │◀── 200 OK ─────────────────│                         │                    │
   │    { xdr, ipfsCid,          │                         │                    │
   │      expiresAt }            │                         │                    │
   │                             │                         │                    │
   │── User signs XDR            │                         │                    │
   │   with Freighter/Albedo     │                         │                    │
   │   (wallet popup)            │                         │                    │
   │                             │                         │                    │
   │── POST /clips/:id/          │                         │                    │
   │   mint-confirm ────────────▶│                         │                    │
   │   { signedXdr }             │                         │                    │
   │                             │── submitTransaction ────────────────────────▶│
   │                             │   (signed XDR)          │                    │
   │                             │                         │                    │
   │                             │◀── { hash, status } ────────────────────────│
   │                             │                         │                    │
   │                             │── Store hash on         │                    │
   │                             │   Clip.mintTxHash       │                    │
   │                             │                         │                    │
   │◀── 200 OK ─────────────────│                         │                    │
   │    { txHash, status,        │                         │                    │
   │      nftId }                │                         │                    │
   │                             │                         │                    │
   │── Poll GET /transactions/   │                         │                    │
   │   :hash/status  ───────────▶│                         │                    │
   │◀── { status: "confirmed" } ─│                         │                    │
```

### Step 1 — mint-prepare

`POST /clips/:id/mint-prepare`

The backend:
1. Loads the clip and verifies ownership + minting eligibility.
2. Uploads NFT metadata JSON to Pinata (IPFS). Metadata includes title, description, clip URL, thumbnail URL, creator address, and royalty BPS.
3. Builds an unsigned Soroban `invokeContract` transaction targeting `SOROBAN_NFT_CONTRACT_ID`.
4. Returns the base64-encoded XDR of the unsigned transaction and the IPFS CID.

The returned `xdr` represents a `TransactionEnvelope` with no signatures attached. The frontend must sign it before calling `mint-confirm`.

### Step 2 — Frontend Signs XDR

```typescript
// Freighter — sign a Soroban XDR transaction
import * as freighter from '@stellar/freighter-api';

async function signMintTransaction(xdr: string): Promise<string> {
  const { signedXDR } = await freighter.signTransaction(xdr, {
    networkPassphrase: 'Test SDF Network ; September 2015',
  });
  return signedXDR;
}
```

```typescript
// Albedo — sign a Soroban XDR transaction
import albedo from '@albedo-link/intent';

async function signMintTransaction(xdr: string): Promise<string> {
  const result = await albedo.tx({
    xdr,
    network: 'testnet', // or 'public'
    submit: false,      // do NOT submit; we want the signed XDR back
  });
  return result.signed_envelope_xdr;
}
```

### Step 3 — mint-confirm

`POST /clips/:id/mint-confirm`

The backend:
1. Decodes and validates the signed XDR (correct transaction, signatures present).
2. Submits the transaction to the Soroban RPC (`sendTransaction`).
3. Stores the transaction hash on `Clip.mintTxHash`.
4. Updates `clip.mintStatus` to `"pending"`.
5. Returns `{ txHash, status: "pending" }`.

### Step 4 — Poll for Confirmation

`GET /transactions/:hash/status`

The frontend polls this endpoint every 2–3 seconds. Once `status` becomes `"confirmed"`, the mint is complete and the NFT exists on-chain.

### NFT Metadata Structure (uploaded to Pinata/IPFS)

```json
{
  "name": "My Viral Clip #42",
  "description": "Best moment from my podcast episode 12 — captured automatically by ClipCash",
  "image": "https://res.cloudinary.com/clipcash/video/upload/t_thumbnail/clips/abc123.jpg",
  "animation_url": "https://res.cloudinary.com/clipcash/video/upload/clips/abc123.mp4",
  "external_url": "https://clipcash.app/clips/abc123",
  "attributes": [
    { "trait_type": "Creator", "value": "GABC...XYZ" },
    { "trait_type": "Duration", "value": "00:00:42" },
    { "trait_type": "Platform", "value": "ClipCash" },
    { "trait_type": "Royalty BPS", "value": 1000 },
    { "trait_type": "Viral Score", "value": 87 }
  ],
  "royalties": {
    "basis_points": 1000,
    "recipient": "GABC...XYZ"
  }
}
```

### Royalty Configuration

Royalties are specified in **basis points** (BPS):

| BPS Value | Percentage |
|---|---|
| `0` | 0% (no royalties) |
| `250` | 2.5% |
| `500` | 5% |
| `1000` | 10% (default) |
| `1500` | 15% (maximum) |

Values above `1500` are rejected with a `400` error:
```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": "Royalty BPS cannot exceed 1500 (15%).",
  "code": "MINT_INVALID_ROYALTY_BPS"
}
```

---

## 7. Transaction Signing — Freighter and Albedo

### Freighter

Freighter is a Chrome/Firefox browser extension maintained by the Stellar Development Foundation. It stores the user's Stellar secret key securely and exposes a JavaScript API.

**Installation check:**
```typescript
import { isConnected } from '@stellar/freighter-api';

const hasFreighter = await isConnected();
```

**Getting the public key:**
```typescript
import { getPublicKey } from '@stellar/freighter-api';

// This prompts the user to grant access if not already allowed
const publicKey = await getPublicKey();
// Returns: "GABC...XYZ"
```

**Signing a message (for wallet connect):**
```typescript
import { signMessage } from '@stellar/freighter-api';

const { signature } = await signMessage('Connect ClipCash wallet 1756484785', {
  networkPassphrase: 'Test SDF Network ; September 2015',
});
// signature is base64-encoded Ed25519 signature
```

**Signing a transaction (for NFT mint):**
```typescript
import { signTransaction } from '@stellar/freighter-api';

const { signedXDR } = await signTransaction(unsignedXdr, {
  networkPassphrase: 'Test SDF Network ; September 2015',
});
// signedXDR is base64-encoded signed TransactionEnvelope
```

**Network passphrases:**
```
Testnet:  "Test SDF Network ; September 2015"
Mainnet:  "Public Global Stellar Network ; September 2015"
```

### Albedo

Albedo is a web-based signer at `albedo.link`. It does not require a browser extension — it opens in a popup window. Good for users who cannot install extensions.

**Signing a message (for wallet connect):**
```typescript
import albedo from '@albedo-link/intent';

const result = await albedo.publicKey({
  token: 'Connect ClipCash wallet 1756484785',
  // Albedo returns pubkey + signature over the token
});

const { pubkey, signature } = result;
```

**Signing a transaction (for NFT mint, not submitting):**
```typescript
import albedo from '@albedo-link/intent';

const result = await albedo.tx({
  xdr: unsignedXdr,
  network: 'testnet',   // or 'public'
  submit: false,        // return signed XDR, don't auto-submit
  description: 'Mint your clip as an NFT on Stellar',
});

const signedXdr = result.signed_envelope_xdr;
```

**Note on `submit: false`:** Always pass `submit: false` when signing mint transactions. ClipCash's backend handles submission so it can track the transaction hash and update the database atomically.

### Lobstr

Lobstr uses WalletConnect v2 under the hood when accessed from a desktop browser. The integration follows the same Stellar signing flow:

```typescript
// After WalletConnect session is established via Lobstr:
const result = await walletConnectSession.request({
  method: 'stellar_signAndSubmitXDR',
  params: { xdr: unsignedXdr },
});
```

---

## 8. Transaction Confirmation and Status Polling

After `mint-confirm` returns, the NFT transaction is submitted but may still be processing on-chain. Stellar transactions are typically confirmed in 5–10 seconds.

### Polling Strategy

```typescript
async function waitForMintConfirmation(
  txHash: string,
  maxWaitMs = 30_000,
  intervalMs = 2_500,
): Promise<MintStatus> {
  const deadline = Date.now() + maxWaitMs;

  while (Date.now() < deadline) {
    const res = await fetch(`/transactions/${txHash}/status`);
    const data = await res.json();

    if (data.status === 'confirmed') {
      return data;
    }

    if (data.status === 'failed') {
      throw new Error(`Mint transaction failed: ${data.error}`);
    }

    // still "pending" — wait before next poll
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }

  throw new Error('Mint confirmation timed out after 30 seconds');
}
```

### Transaction Status Values

| Status | Meaning |
|---|---|
| `pending` | Transaction submitted, not yet included in a ledger |
| `confirmed` | Transaction included in a ledger; NFT exists on-chain |
| `failed` | Transaction rejected by the network (insufficient fee, contract error, etc.) |
| `not_found` | Hash not recognised by the RPC node (may be too early; keep polling briefly) |

### Soroban RPC — `getTransaction` Response Mapping

The backend calls `getTransaction(hash)` on the Soroban RPC and maps the result:

| Soroban RPC status | ClipCash status |
|---|---|
| `SUCCESS` | `confirmed` |
| `FAILED` | `failed` |
| `NOT_FOUND` | `not_found` |
| (request error) | `pending` (retry) |

---

## 9. Address Masking

All wallet addresses returned by the API are **partially masked**. Only the last 6 characters are shown; the rest are replaced with asterisks.

**Examples:**

| Raw Address | Masked Address |
|---|---|
| `GAHJJJKMOKYE4RVPZEWZTKH5FVI4PA3VL7GK2LFNUBSGBV3RPVMVP5QQ` | `******P5QQ` |
| `0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045` | `******96045` |
| `7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgHkv` | `******gHkv` |

**Implementation:**

```typescript
function maskAddress(address: string): string {
  if (address.length <= 6) {
    return '******';
  }
  return `******${address.slice(-6)}`;
}
```

The full (unmasked) address is stored in the database and used internally for blockchain operations, but is never returned in API responses. This protects users in the following scenarios:

- Server logs being scraped
- API responses accidentally included in analytics or error tracking (e.g., Sentry)
- Responses visible in frontend browser DevTools
- Third-party integrations receiving webhook payloads

---

## 10. Balance Checks and Warnings

When `GET /wallets/:id/balance` is called for a Stellar wallet, the backend fetches the native XLM balance from Horizon or the Soroban RPC and returns a `lowBalance` warning flag if below the threshold.

**Threshold:** 2 XLM

```json
{
  "walletId": "wlt_01J5XQP9N8ZC3AGYRVWFDB3VBK",
  "maskedAddress": "******P5QQ",
  "chain": "stellar",
  "balance": {
    "xlm": "1.4500000",
    "usdEstimate": "0.21",
    "lowBalance": true,
    "lowBalanceWarning": "Your XLM balance is below 2 XLM. Minting an NFT requires at least 1 XLM for transaction fees. Please top up your wallet."
  }
}
```

When `lowBalance` is `false`:

```json
{
  "walletId": "wlt_01J5XQP9N8ZC3AGYRVWFDB3VBK",
  "maskedAddress": "******P5QQ",
  "chain": "stellar",
  "balance": {
    "xlm": "24.8300000",
    "usdEstimate": "3.72",
    "lowBalance": false,
    "lowBalanceWarning": null
  }
}
```

> Note: Balance checks do not block minting at `mint-prepare` time. If the balance is insufficient, the transaction will be rejected by the Stellar network at submission time and `mint-confirm` will return a `422` error.

---

## 11. Environment Variables

The following environment variables control wallet and minting behaviour. Set them in `.env` (copy from `.env.example`).

| Variable | Required | Default | Description |
|---|---|---|---|
| `STELLAR_NETWORK` | ✅ | `testnet` | `testnet` or `public`. Controls RPC URL and network passphrase. |
| `SOROBAN_NFT_CONTRACT_ID` | ✅ | — | Contract address of the deployed Soroban NFT contract. Required for all mint endpoints. |
| `PINATA_JWT` | ✅ | — | JWT from Pinata dashboard. Used to upload NFT metadata JSON to IPFS before minting. |
| `ENCRYPTION_SECRET` | ✅ | — | Min 32-char string. Used to encrypt any sensitive wallet metadata at rest. Never store raw private keys. |
| `MIN_STELLAR_PAYOUT` | — | `5` | Minimum USD equivalent for Stellar payouts. Not directly related to minting but affects the wallet payout flow. |

### Network Passphrase Reference

The `StellarService` reads `STELLAR_NETWORK` at startup and sets the correct passphrase automatically:

```typescript
const NETWORK_CONFIG = {
  testnet: {
    rpcUrl: 'https://soroban-testnet.stellar.org',
    networkPassphrase: 'Test SDF Network ; September 2015',
  },
  public: {
    rpcUrl: 'https://soroban-rpc.stellar.org',
    networkPassphrase: 'Public Global Stellar Network ; September 2015',
  },
};
```

You must use the **matching** passphrase in your frontend wallet signing calls. A mismatch causes signature verification to fail and the transaction to be rejected.

---

## 12. API Endpoint Reference

All endpoints (except where noted) require a `Authorization: Bearer <jwt>` header.

---

### POST /wallets/connect

Connect a new wallet to the authenticated user's account. The wallet is upserted — calling this again with the same `publicKey` updates the existing record.

**Request body:**

```json
{
  "publicKey": "GAHJJJKMOKYE4RVPZEWZTKH5FVI4PA3VL7GK2LFNUBSGBV3RPVMVP5QQ",
  "signature": "aBcDeFgHiJkLmNoPqRsTuVwXyZaBcDeFgHiJkLmNoPqRsTuVwXyZ012345678901==",
  "signedMessage": "Connect ClipCash wallet 1756484785",
  "chain": "stellar",
  "type": "freighter"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `publicKey` | string | ✅ | Full wallet address (not masked). Validated against `chain` format rules. |
| `signature` | string | ✅ | Base64-encoded signature of `signedMessage` by the wallet's private key. |
| `signedMessage` | string | ✅ | The exact message that was signed. Must match format `Connect ClipCash wallet {timestamp}`. |
| `chain` | string | ✅ | One of: `stellar`, `solana`, `base`, `ethereum`. |
| `type` | string | ✅ | Wallet provider (see §2 for valid values). |

**Response `201 Created`:**

```json
{
  "id": "wlt_01J5XQP9N8ZC3AGYRVWFDB3VBK",
  "maskedAddress": "******P5QQ",
  "chain": "stellar",
  "type": "freighter",
  "isPrimary": true,
  "connectedAt": "2026-08-29T16:26:25.893Z"
}
```

**Error responses:**

| Status | Code | Cause |
|---|---|---|
| 400 | `WALLET_INVALID_ADDRESS` | Address format does not match declared chain |
| 400 | `WALLET_INVALID_SIGNATURE` | Signature verification failed |
| 400 | `WALLET_EXPIRED_MESSAGE` | Timestamp in `signedMessage` is older than 5 minutes |
| 400 | `WALLET_INVALID_MESSAGE_FORMAT` | `signedMessage` does not match expected format |
| 409 | `WALLET_ALREADY_CONNECTED` | Same address is already linked to a different user account |

---

### GET /wallets

List all wallets connected to the authenticated user's account.

**Request:** No body. No query parameters.

**Response `200 OK`:**

```json
{
  "wallets": [
    {
      "id": "wlt_01J5XQP9N8ZC3AGYRVWFDB3VBK",
      "maskedAddress": "******P5QQ",
      "chain": "stellar",
      "type": "freighter",
      "isPrimary": true,
      "connectedAt": "2026-08-29T16:26:25.893Z"
    },
    {
      "id": "wlt_01J5XQP9N8ZC3AGYRVWFDB3VBL",
      "maskedAddress": "******6045",
      "chain": "base",
      "type": "metamask",
      "isPrimary": false,
      "connectedAt": "2026-08-28T09:14:02.000Z"
    }
  ],
  "total": 2
}
```

---

### GET /wallets/:id

Get a single wallet by its internal ID.

**Path parameters:**

| Parameter | Description |
|---|---|
| `id` | Wallet ID (e.g. `wlt_01J5XQP9N8ZC3AGYRVWFDB3VBK`) |

**Response `200 OK`:**

```json
{
  "id": "wlt_01J5XQP9N8ZC3AGYRVWFDB3VBK",
  "maskedAddress": "******P5QQ",
  "chain": "stellar",
  "type": "freighter",
  "isPrimary": true,
  "connectedAt": "2026-08-29T16:26:25.893Z"
}
```

**Error responses:**

| Status | Code | Cause |
|---|---|---|
| 404 | `WALLET_NOT_FOUND` | No wallet with that ID belonging to the authenticated user |

---

### GET /wallets/:id/balance

Fetch the on-chain balance for a wallet. For Stellar wallets, returns XLM balance with a low-balance warning if below 2 XLM. For Solana and EVM wallets, returns the native token balance.

**Path parameters:**

| Parameter | Description |
|---|---|
| `id` | Wallet ID |

**Response `200 OK` (Stellar, sufficient balance):**

```json
{
  "walletId": "wlt_01J5XQP9N8ZC3AGYRVWFDB3VBK",
  "maskedAddress": "******P5QQ",
  "chain": "stellar",
  "balance": {
    "xlm": "24.8300000",
    "usdEstimate": "3.72",
    "lowBalance": false,
    "lowBalanceWarning": null
  },
  "fetchedAt": "2026-08-29T16:30:00.000Z"
}
```

**Response `200 OK` (Stellar, low balance):**

```json
{
  "walletId": "wlt_01J5XQP9N8ZC3AGYRVWFDB3VBK",
  "maskedAddress": "******P5QQ",
  "chain": "stellar",
  "balance": {
    "xlm": "1.4500000",
    "usdEstimate": "0.22",
    "lowBalance": true,
    "lowBalanceWarning": "Your XLM balance is below 2 XLM. Minting an NFT requires at least 1 XLM for transaction fees. Please top up your wallet."
  },
  "fetchedAt": "2026-08-29T16:30:00.000Z"
}
```

**Error responses:**

| Status | Code | Cause |
|---|---|---|
| 404 | `WALLET_NOT_FOUND` | Wallet ID does not exist for this user |
| 502 | `BALANCE_FETCH_FAILED` | Stellar Horizon or Soroban RPC unreachable |

---

### DELETE /wallets/:id

Disconnect (remove) a wallet from the user's account. This only deletes the association in ClipCash's database — it has no on-chain effect.

**Path parameters:**

| Parameter | Description |
|---|---|
| `id` | Wallet ID |

**Response `204 No Content`** — empty body on success.

**Error responses:**

| Status | Code | Cause |
|---|---|---|
| 404 | `WALLET_NOT_FOUND` | Wallet ID does not exist for this user |
| 409 | `WALLET_HAS_PENDING_MINT` | A mint transaction referencing this wallet is still pending. Wait for it to confirm or fail before disconnecting. |

---

### GET /wallets/:address/nfts

List NFTs owned by a Stellar wallet address. Queries the Soroban NFT contract (`SOROBAN_NFT_CONTRACT_ID`) directly.

> This endpoint accepts the **raw** wallet address (not the wallet ID) because it can be called for any address, not only addresses connected to the authenticated user.

**Path parameters:**

| Parameter | Description |
|---|---|
| `address` | Full Stellar public key (G... format) |

**Query parameters:**

| Parameter | Type | Default | Description |
|---|---|---|---|
| `limit` | integer | `20` | Maximum number of NFTs to return |
| `offset` | integer | `0` | Pagination offset |

**Response `200 OK`:**

```json
{
  "address": "G...XYZ",
  "maskedAddress": "******P5QQ",
  "nfts": [
    {
      "nftId": "42",
      "contractId": "CXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
      "clipId": "clp_01J5XQP9N8ZC3AGYRVWFDB3VBK",
      "title": "My Viral Clip #42",
      "ipfsCid": "QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco",
      "metadataUrl": "ipfs://QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco",
      "mintTxHash": "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
      "royaltyBps": 1000,
      "mintedAt": "2026-08-29T16:28:00.000Z"
    }
  ],
  "total": 1,
  "limit": 20,
  "offset": 0
}
```

---

### POST /clips/:id/mint-prepare

Prepare an unsigned Soroban transaction for minting a clip as an NFT. Uploads metadata to IPFS and builds the XDR. Does **not** submit to the network.

**Path parameters:**

| Parameter | Description |
|---|---|
| `id` | Clip ID |

**Request body:**

```json
{
  "walletId": "wlt_01J5XQP9N8ZC3AGYRVWFDB3VBK",
  "royaltyBps": 1000,
  "title": "My Viral Clip #42",
  "description": "Best moment from my podcast — auto-clipped by ClipCash"
}
```

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `walletId` | string | ✅ | — | ID of the connected Stellar wallet to use as the minting account and royalty recipient. |
| `royaltyBps` | integer | — | `1000` | Royalty in basis points (0–1500). |
| `title` | string | — | Clip title | Override the NFT name. Max 200 chars. |
| `description` | string | — | — | NFT description. Max 1000 chars. |

**Response `200 OK`:**

```json
{
  "clipId": "clp_01J5XQP9N8ZC3AGYRVWFDB3VBK",
  "walletId": "wlt_01J5XQP9N8ZC3AGYRVWFDB3VBK",
  "maskedAddress": "******P5QQ",
  "xdr": "AAAAAgAAAABH...base64encodedXDR...==",
  "ipfsCid": "QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco",
  "metadataUrl": "ipfs://QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco",
  "network": "testnet",
  "networkPassphrase": "Test SDF Network ; September 2015",
  "expiresAt": "2026-08-29T16:36:25.893Z",
  "royaltyBps": 1000
}
```

The `xdr` field is a base64-encoded unsigned `TransactionEnvelope`. The frontend must sign this with the wallet corresponding to `maskedAddress` and submit the result to `mint-confirm`.

The `expiresAt` field reflects the transaction's `timeBounds.maxTime`. Signing after this time will produce a transaction the network will reject. If it expires, call `mint-prepare` again to get a fresh XDR.

**Error responses:**

| Status | Code | Cause |
|---|---|---|
| 400 | `MINT_CLIP_ALREADY_POSTED` | `clip.postStatus === 'posted'`. Cannot mint auto-posted clips. |
| 400 | `MINT_INVALID_ROYALTY_BPS` | `royaltyBps` exceeds 1500 or is negative. |
| 400 | `MINT_ALREADY_MINTED` | Clip already has a `mintTxHash` (already minted). |
| 404 | `CLIP_NOT_FOUND` | Clip ID not found or belongs to a different user. |
| 404 | `WALLET_NOT_FOUND` | `walletId` not found or is not a Stellar wallet. |
| 503 | `IPFS_UPLOAD_FAILED` | Pinata upload failed. Retry later. |
| 503 | `SOROBAN_BUILD_FAILED` | Soroban XDR construction failed. Retry later. |

---

### POST /clips/:id/mint-confirm

Submit a signed Soroban transaction to the Stellar network to complete minting.

**Path parameters:**

| Parameter | Description |
|---|---|
| `id` | Clip ID (same as used in `mint-prepare`) |

**Request body:**

```json
{
  "signedXdr": "AAAAAgAAAABH...base64encodedSignedXDR...=="
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `signedXdr` | string | ✅ | Base64-encoded signed `TransactionEnvelope` returned by the wallet after signing the `xdr` from `mint-prepare`. |

**Response `200 OK`:**

```json
{
  "clipId": "clp_01J5XQP9N8ZC3AGYRVWFDB3VBK",
  "txHash": "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
  "status": "pending",
  "network": "testnet",
  "explorerUrl": "https://stellar.expert/explorer/testnet/tx/a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
  "submittedAt": "2026-08-29T16:31:00.000Z"
}
```

After receiving this response, poll `GET /transactions/:hash/status` until `status` is `"confirmed"` or `"failed"`.

**Error responses:**

| Status | Code | Cause |
|---|---|---|
| 400 | `MINT_INVALID_XDR` | `signedXdr` cannot be decoded or is not a valid transaction envelope. |
| 400 | `MINT_XDR_NOT_SIGNED` | The XDR contains no signatures. |
| 400 | `MINT_WRONG_TRANSACTION` | The submitted XDR does not match the transaction built during `mint-prepare`. |
| 404 | `CLIP_NOT_FOUND` | Clip ID not found or no pending prepare for it. |
| 422 | `MINT_TRANSACTION_REJECTED` | Stellar network rejected the transaction (insufficient fee, contract error, etc.). Check `error.detail` for the Soroban error code. |
| 503 | `SOROBAN_SUBMIT_FAILED` | Soroban RPC unreachable. Retry later. |

---

### GET /transactions/:hash/status

Poll the status of a Stellar transaction by its hash. Used to confirm minting or payout transactions.

**Path parameters:**

| Parameter | Description |
|---|---|
| `hash` | Stellar transaction hash (64 hex characters) |

**Response `200 OK` (pending):**

```json
{
  "hash": "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
  "status": "pending",
  "ledger": null,
  "confirmedAt": null,
  "error": null
}
```

**Response `200 OK` (confirmed):**

```json
{
  "hash": "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
  "status": "confirmed",
  "ledger": 51234567,
  "confirmedAt": "2026-08-29T16:31:07.000Z",
  "error": null
}
```

**Response `200 OK` (failed):**

```json
{
  "hash": "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
  "status": "failed",
  "ledger": 51234567,
  "confirmedAt": null,
  "error": {
    "code": "CONTRACT_ERROR",
    "detail": "HostError: Wasm contract trapped: TokenAlreadyMinted"
  }
}
```

**Error responses:**

| Status | Code | Cause |
|---|---|---|
| 400 | `INVALID_TX_HASH` | Hash is not 64 hex characters. |
| 502 | `SOROBAN_RPC_UNAVAILABLE` | Cannot reach the Soroban RPC to look up the transaction. |

---

## 13. Error Reference

All API errors follow this envelope:

```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": "Human-readable explanation",
  "code": "MACHINE_READABLE_CODE",
  "requestId": "req_01J5XQP9N8ZC3AGYRVWFDB3VBK"
}
```

### Wallet Errors

| Code | HTTP | Description |
|---|---|---|
| `WALLET_INVALID_ADDRESS` | 400 | Address format is invalid for the declared chain |
| `WALLET_INVALID_SIGNATURE` | 400 | Ed25519/ECDSA signature verification failed |
| `WALLET_EXPIRED_MESSAGE` | 400 | Timestamp in `signedMessage` is older than 5 minutes |
| `WALLET_INVALID_MESSAGE_FORMAT` | 400 | `signedMessage` does not match `Connect ClipCash wallet {timestamp}` |
| `WALLET_NOT_FOUND` | 404 | No wallet found for the given ID belonging to the authenticated user |
| `WALLET_ALREADY_CONNECTED` | 409 | Address already linked to a different account |
| `WALLET_HAS_PENDING_MINT` | 409 | Cannot disconnect wallet while a mint is pending |
| `BALANCE_FETCH_FAILED` | 502 | On-chain balance lookup failed |

### Mint Errors

| Code | HTTP | Description |
|---|---|---|
| `MINT_CLIP_ALREADY_POSTED` | 400 | `clip.postStatus === 'posted'`; auto-posted clips cannot be minted |
| `MINT_ALREADY_MINTED` | 400 | Clip already has a `mintTxHash` |
| `MINT_INVALID_ROYALTY_BPS` | 400 | `royaltyBps` out of range (must be 0–1500) |
| `MINT_INVALID_XDR` | 400 | Cannot decode the provided `signedXdr` |
| `MINT_XDR_NOT_SIGNED` | 400 | The XDR envelope contains no signatures |
| `MINT_WRONG_TRANSACTION` | 400 | Submitted XDR does not match the prepared transaction |
| `MINT_TRANSACTION_REJECTED` | 422 | Stellar network rejected the transaction |
| `IPFS_UPLOAD_FAILED` | 503 | Pinata IPFS upload failed |
| `SOROBAN_BUILD_FAILED` | 503 | Could not build the Soroban transaction |
| `SOROBAN_SUBMIT_FAILED` | 503 | Could not submit to Soroban RPC |
| `SOROBAN_RPC_UNAVAILABLE` | 502 | Soroban RPC endpoint unreachable |

### Transaction Errors

| Code | HTTP | Description |
|---|---|---|
| `INVALID_TX_HASH` | 400 | Transaction hash is not 64 hex characters |
| `SOROBAN_RPC_UNAVAILABLE` | 502 | RPC node unreachable during status lookup |

---

## 14. Security Considerations

### Private Keys Never Leave the Browser

The server never sees, requests, or stores any private key or seed phrase. All transaction signing is performed exclusively in the user's browser by their wallet extension (Freighter, MetaMask, Phantom, etc.). The API only accepts:
- Public keys (for identity)
- Signatures (for verification)
- Signed transaction XDRs (for submission)

### Replay Attack Prevention

The signed message `Connect ClipCash wallet {timestamp}` includes a Unix timestamp. The backend enforces a **5-minute window**: connections attempted with a timestamp older than 300 seconds are rejected with `WALLET_EXPIRED_MESSAGE`. This prevents an attacker from capturing a valid signature and replaying it later.

### Address Masking in Responses and Logs

Full wallet addresses are never returned in API responses. The masking rule (last 6 characters) applies to all wallet list endpoints, balance endpoints, NFT list endpoints, and any error payloads that reference a wallet. Backend logging should also apply masking before writing address values to structured logs.

### SOROBAN_NFT_CONTRACT_ID Must Be Set

If `SOROBAN_NFT_CONTRACT_ID` is not set, all mint endpoints return `503`. Do not allow mint endpoints to silently succeed or fall back to a test contract in production. Fail loudly with a clear error to prevent unintended cross-environment contract interactions.

### Testnet vs Mainnet Isolation

Set `STELLAR_NETWORK=testnet` in all non-production environments. The network passphrase is embedded in the XDR — a transaction built for testnet cannot be submitted to mainnet and vice versa. However, never configure `SOROBAN_NFT_CONTRACT_ID` with a mainnet contract ID in a testnet environment.

### Input Validation

All incoming address strings and XDR blobs are validated before any processing:
- Address format checked against chain-specific regex (see §3)
- XDR decoded and schema-validated before submission
- `royaltyBps` range enforced (0–1500)
- `signedMessage` format validated with regex before timestamp extraction

This prevents invalid data from reaching the Stellar SDK and causing unexpected exceptions or panics in the Soroban XDR serialisation layer.

### Rate Limiting

Wallet connect and mint endpoints are rate-limited. Refer to [docs/rate-limits.md](./rate-limits.md) for the current limits. Repeated failed signature verifications from the same IP are logged and may trigger temporary blocks via the anomaly-detection job queue.

---

*For Stellar-specific configuration (network switching, payout flow), see [docs/stellar-integration.md](./stellar-integration.md).*  
*For API rate limits, see [docs/rate-limits.md](./rate-limits.md).*  
*For error code definitions, see [docs/error-codes.md](./error-codes.md).*
