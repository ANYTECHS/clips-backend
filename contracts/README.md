# ClipCash NFT Smart Contract

Soroban smart contract that handles NFT minting, ownership, royalties, and metadata for ClipCash on the [Stellar](https://stellar.org/) network.

---

## Overview

| Property   | Value                           |
|------------|---------------------------------|
| Name       | ClipCash NFT Contract           |
| Symbol     | CLIP                            |
| Version    | 1.0.0                           |
| Network    | Stellar Testnet / Mainnet       |
| Language   | Rust (Soroban SDK 22)           |

---

## Directory structure

```
contracts/
└── nft-contract/
    ├── Cargo.toml
    └── src/
        ├── lib.rs        # Main contract logic
        ├── storage.rs    # Storage helpers (persistent + instance)
        ├── metadata.rs   # ClipMetadata type
        ├── admin.rs      # Admin helpers
        └── test.rs       # Unit tests (soroban testutils)
```

---

## Prerequisites

- **Rust** ≥ 1.74 — install via [rustup](https://rustup.rs)
- **Soroban CLI** — `cargo install --locked soroban-cli`
- **wasm32 target** — `rustup target add wasm32-unknown-unknown`

---

## Build

```bash
# From the repo root
cd contracts/nft-contract

# Compile to Wasm (release build — optimised for on-chain deployment)
cargo build --release --target wasm32-unknown-unknown

# The .wasm artifact will be at:
# target/wasm32-unknown-unknown/release/clips_nft_contract.wasm
```

---

## Test

```bash
cd contracts/nft-contract

# Run all unit tests (uses soroban testutils — no network required)
cargo test

# Run with feature flag for testutils mocks
cargo test --features testutils
```

---

## Deploy (testnet)

```bash
# 1. Fund a test account
soroban keys generate --global deployer --network testnet

# 2. Deploy the contract
soroban contract deploy \
  --wasm target/wasm32-unknown-unknown/release/clips_nft_contract.wasm \
  --network testnet \
  --source deployer

# Note the CONTRACT_ID in the output, e.g.:
# CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC

# 3. Initialize the contract (sets admin and default royalty = 1000 bps = 10%)
soroban contract invoke \
  --id <CONTRACT_ID> \
  --network testnet \
  --source deployer \
  -- initialize \
  --admin <YOUR_STELLAR_PUBLIC_KEY> \
  --royalty_bps 1000
```

---

## Key contract functions

| Function                   | Auth       | Description                                          |
|----------------------------|-----------|------------------------------------------------------|
| `initialize(admin, bps)`   | —         | One-time setup. Sets admin/owner and default royalty |
| `get_owner()`              | Public    | Returns the contract owner address                   |
| `contract_info()`          | Public    | Returns version, name, symbol                        |
| `mint(to, token_id, ...)`  | Admin     | Mints a new NFT. Prevents duplicate `clip_id`        |
| `set_royalty(caller, id, bps, recipient)` | Creator | Updates per-token royalty (max 1500 bps) |
| `get_royalties(token_id)`  | Public    | Returns `{ recipient, bps }` for a token             |
| `transfer(from, to, id)`   | Owner     | Transfers a non-soulbound NFT                        |
| `owner_of(token_id)`       | Public    | Returns current owner address                        |
| `get_token_data(token_id)` | Public    | Returns full token struct                            |
| `set_default_royalty_bps(bps)` | Admin | Updates the default royalty for future mints         |
| `get_default_royalty_bps()` | Public   | Returns current default royalty                      |
| `total_supply()`           | Public    | Returns number of minted tokens                      |

---

## Royalty model

Royalties are expressed in **basis points** (BPS):

| BPS   | Percentage |
|-------|-----------|
| 0     | 0%        |
| 500   | 5%        |
| 1000  | 10%       |
| 1500  | 15% (max) |

- The contract rejects any royalty > **1500 BPS** (15%).
- Per-token royalties override the contract-wide default.
- Only the original token creator can update a token's royalty.

---

## Backend integration

The NestJS backend uses this contract via `@stellar/stellar-sdk`. See:

- [`src/clips/nft-mint.service.ts`](../../src/clips/nft-mint.service.ts) — mint orchestration
- [`src/nft/royalty-query.service.ts`](../../src/nft/royalty-query.service.ts) — `get_royalties` queries
- [`src/nft/royalty-configuration.service.ts`](../../src/nft/royalty-configuration.service.ts) — royalty BPS helpers

### Backend endpoint reference

| Method | Endpoint                  | Description                             |
|--------|---------------------------|-----------------------------------------|
| POST   | `/nfts/prepare-mint`      | Build unsigned Soroban XDR for signing  |
| POST   | `/nfts/confirm-mint`      | Confirm completed on-chain mint         |
| GET    | `/nfts/:mintAddress/royalty` | Query royalty info (cached 5 min)    |
| PATCH  | `/nfts/:id/royalty`       | Update per-token royalty                |
| GET    | `/nfts/contract/info`     | Returns `{ contractId, network, version }` |

#### Example: contract info response

```json
{
  "contractId": "CXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  "network": "testnet",
  "version": "1.0.0",
  "name": "ClipCash NFT",
  "symbol": "CLIP"
}
```

#### Example: prepare-mint request

```json
{
  "walletAddress": "GC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3",
  "clipId": 42,
  "metadataUri": "ipfs://QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG"
}
```

#### Example: prepare-mint response

```json
{
  "xdr": "AAAAAgAAAAA...",
  "clipId": 42,
  "metadataUri": "ipfs://QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG"
}
```
