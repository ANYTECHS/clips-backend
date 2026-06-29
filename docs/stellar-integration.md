# Stellar / Soroban Integration

This document describes how the ClipCash backend talks to Stellar (Horizon + Soroban RPC) and the NFT royalty contract in `contracts/nft-royalty/`.

## Configuration

Set these in `.env` (see `.env.example`):

| Variable | Purpose |
| -------- | ------- |
| `STELLAR_NETWORK` | `testnet` (default) or `public` (mainnet) |
| `SOROBAN_NFT_CONTRACT_ID` | Deployed Soroban contract ID (required for mint/royalty) |
| `PLATFORM_WALLET_ADDRESS` | Platform royalty recipient |
| `PLATFORM_ROYALTY_BPS` | Platform share in basis points (default `100` = 1%) |
| `PINATA_JWT` | IPFS metadata upload for NFT mints |

`StellarService` picks RPC and network passphrase from `STELLAR_NETWORK`:

```typescript
// src/stellar/stellar.service.ts — network selection at startup
const raw = (process.env.STELLAR_NETWORK ?? 'testnet').toLowerCase();
this.network = raw === 'public' ? 'public' : 'testnet';
// testnet → https://soroban-testnet.stellar.org
// public  → https://soroban-rpc.stellar.org
```

## Wallet connection

Users connect a Stellar wallet through the API. The backend validates the address format and stores the wallet in PostgreSQL.

**Endpoint:** `POST /wallets/connect` (JWT required)

**Body:**

```json
{
  "address": "GC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3",
  "chain": "stellar",
  "type": "freighter"
}
```

`type` must be one of: `freighter`, `lobstr`, `albedo`.

**Flow:**

1. `WalletValidationService` calls `StellarService.validateAddress()` (Ed25519 public key check).
2. `WalletManagementService` upserts the row; soft-deleted wallets are reactivated (`deletedAt: null`).

**Disconnect:** `DELETE /wallets/:id` — blocked if pending payouts exist on that wallet.

**Example (curl):**

```bash
curl -X POST http://localhost:3000/wallets/connect \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{"address":"GC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3","chain":"stellar","type":"freighter"}'
```

## Mint flow

Minting is a two-step process: the backend builds an unsigned Soroban transaction (XDR); the client signs and submits with Freighter (or another wallet).

### 1. Prepare mint transaction

**Endpoint:** `POST /nfts/prepare-mint` (login required)

**Body:**

```json
{
  "clipId": 42,
  "walletAddress": "GC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3"
}
```

**Backend steps (`NftMintService.prepareMintTx`):**

1. Validate clip ownership (`validateClipOwner`).
2. Validate wallet address via `StellarService`.
3. Ensure clip has `clipUrl` and is not already `minting` / `minted`.
4. Upload metadata to IPFS if `metadataUri` is missing.
5. Build Soroban `mint` call with royalty map (creator + platform BPS).
6. Return XDR for the client to sign.

**Response (simplified):**

```json
{
  "xdr": "...",
  "clipId": 42,
  "tokenId": 42,
  "metadataUri": "ipfs://...",
  "to": "GC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3",
  "contractId": "C...",
  "network": "testnet"
}
```

**Example:**

```bash
curl -X POST http://localhost:3000/nfts/prepare-mint \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{"clipId":42,"walletAddress":"GC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3"}'
```

Creator royalty on the clip defaults to `1000` BPS (10%) and can be set via bulk clip update (`royaltyBps`, max `1500`). Platform royalty comes from `PLATFORM_ROYALTY_BPS`.

### 2. Client signs and submits

The frontend uses `@stellar/stellar-sdk` (or the wallet extension) to sign the returned XDR and submit to Soroban RPC. The backend does not hold user private keys.

### Legacy stub mint

`POST /nfts/mint` with `MintClipDto` still exists for development stubs (`NftService.mintClip`). Production flows should use `prepare-mint` + client signing.

## Royalty queries

### Single token

**Endpoint:** `GET /nfts/:mintAddress/royalty`

`mintAddress` is the numeric token ID (same as `clip.id` at mint time). Results are cached in Redis for 5 minutes.

**Example:**

```bash
curl http://localhost:3000/nfts/42/royalty
```

**Response:**

```json
{
  "royaltyBps": 1000,
  "recipient": "GC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3"
}
```

`RoyaltyQueryService` simulates the contract read via Soroban RPC (`StellarService.rpcUrl`).

### Batch royalty

**Endpoint:** `POST /nft/batch-royalty` (public)

**Body:**

```json
{
  "tokenIds": [1, 2, 3]
}
```

Max 100 tokens per request. `BatchRoyaltyService` calls `batch_royalty_info` on the contract and caches results for 5 minutes.

**Example:**

```bash
curl -X POST http://localhost:3000/nft/batch-royalty \
  -H "Content-Type: application/json" \
  -d '{"tokenIds":[1,2,3]}'
```

### Platform revenue

**Endpoint:** `GET /platform/revenue` — reads accumulated platform fees from the contract (see `PlatformRevenueController`).

## Contract reference

Source: `contracts/nft-royalty/`. Deploy with:

```bash
cd contracts/nft-royalty
cargo build --target wasm32-unknown-unknown --release
./scripts/deploy.sh testnet
```

Set `SOROBAN_NFT_CONTRACT_ID` in `.env` to the deployed contract ID.

## Related modules

| Module / service | Role |
| ---------------- | ---- |
| `StellarModule` / `StellarService` | Network config, address validation, Horizon helpers |
| `NftMintService` | Metadata IPFS upload, prepare-mint XDR |
| `RoyaltyQueryService` | Single-token on-chain royalty read |
| `BatchRoyaltyService` | Batch on-chain royalty read |
| `WalletsModule` | Connect / disconnect user wallets |

For payout flows (XLM off-clip earnings), see `README.md` (Stellar Network Configuration) and `PAYOUT_ARCHITECTURE.md`.
