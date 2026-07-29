# ClipCash NFT Soroban Contract

Source: [`contracts/nft-contract/src`](./nft-contract/src). Deployed on Stellar via Soroban. Contract metadata: `name = "ClipCash NFT Contract"`, `version = "1.0.0"`.

This document is the contract ABI reference for frontend/integrator developers. For the backend REST API that wraps these calls (metadata upload, transaction preparation, signature verification), see [`docs/api-contract.md § 6 NFT Minting`](../docs/api-contract.md#6-nft-minting).

## Table of Contents

1. [Data Types](#1-data-types)
2. [Errors](#2-errors)
3. [Public Functions](#3-public-functions)
4. [Events](#4-events)
5. [Usage Examples](#5-usage-examples)

---

## 1. Data Types

### `TokenData`

Stored per minted token (`token_id`).

| Field | Type | Description |
|---|---|---|
| `owner` | `Address` | Current holder of the token |
| `is_soulbound` | `bool` | If `true`, the token can never be transferred or approved |
| `creator` | `Address` | Original minter / recipient — royalty payments go here |
| `clip_id` | `String` | ClipCash clip identifier this token represents |
| `content_uri` | `String` | IPFS/Arweave metadata URI |
| `created_at` | `u64` | Ledger timestamp (seconds) at mint time |

---

## 2. Errors

All fallible functions return `Result<T, Error>`. `Error` is a `#[contracterror]` enum (`u32` codes):

| Code | Variant | Meaning |
|---|---|---|
| 1 | `Unauthorized` | Caller is not the token owner / an approved spender |
| 2 | `TokenNotFound` | No token exists for the given `token_id` |
| 3 | `AlreadyInitialized` | `initialize` called more than once |
| 4 | `NotInitialized` | Admin-gated call made before `initialize` |
| 5 | `SoulboundTokenNotTransferable` | Attempted transfer/approve of a soulbound token |
| 6 | `InvalidTokenId` | `mint` called with a `token_id` that already exists |
| 7 | `InvalidRoyaltyBps` | Royalty value outside 0–10 000 BPS |
| 8 | `ContractPaused` | Contract is paused; mint/transfer/approve rejected |
| 9 | `UnsupportedAsset` | Asset contract address is not on the royalty allow-list |

---

## 3. Public Functions

### Admin & Lifecycle

#### `initialize(admin: Address) -> Result<(), Error>`
One-time setup. Sets the contract admin. Fails with `AlreadyInitialized` if called again.

#### `pause() -> Result<(), Error>`
Pauses the contract — `mint`, `transfer`, `transfer_from`, and `approve` all reject with `ContractPaused` until unpaused. **Admin only.** Emits `paused`.

#### `unpause() -> Result<(), Error>`
Restores normal operation. **Admin only.** Emits `unpaused`.

#### `is_paused() -> bool`
Returns the current pause state. Read-only, no auth required.

### Minting & Ownership

#### `mint(to: Address, token_id: u64, clip_id: String, content_uri: String, is_soulbound: bool) -> Result<(), Error>`
Mints a new token to `to`. **Admin only** (`admin.require_auth()`); rejected while paused. Fails with `InvalidTokenId` if `token_id` is already minted. The minting recipient (`to`) is recorded as the token's `creator` for royalty purposes. Emits `mint`.

#### `owner_of(token_id: u64) -> Option<Address>`
Current owner of a token, or `None` if it doesn't exist.

#### `get_token_data(token_id: u64) -> Option<TokenData>`
Full stored record for a token.

#### `is_soulbound(token_id: u64) -> bool`
Whether the token is non-transferable. Returns `false` for unknown tokens.

#### `get_creator(token_id: u64) -> Option<Address>`
The original minting recipient (used as the royalty recipient).

#### `balance_of(owner: Address) -> u64`
Number of tokens held by `owner`.

#### `total_supply() -> u64`
Total tokens ever minted.

### Transfers & Approvals

#### `transfer(from: Address, to: Address, token_id: u64) -> Result<(), Error>`
Transfers `token_id` from `from` to `to`. Requires `from.require_auth()`. Rejected while paused, for soulbound tokens (`SoulboundTokenNotTransferable`), or if `from` isn't the current owner. Emits `transfer`.

#### `approve(owner: Address, spender: Address, token_id: u64) -> Result<(), Error>`
Authorizes `spender` to transfer `token_id` on `owner`'s behalf. Requires `owner.require_auth()`. Rejected while paused or for soulbound tokens. Emits `approve`.

#### `get_approved(token_id: u64) -> Option<Address>`
Currently approved spender for a token, if any.

#### `transfer_from(spender: Address, from: Address, to: Address, token_id: u64) -> Result<(), Error>`
Transfers `token_id` from `from` to `to` on behalf of an approved `spender` (or the owner). Requires `spender.require_auth()`. Rejected while paused or for soulbound tokens. Clears any existing approval. Emits `transfer`.

### Royalties

#### `set_default_royalty_bps(bps: u32) -> Result<(), Error>`
Sets the default royalty rate applied on secondary sales, in basis points (1 BPS = 0.01%; max `10_000` = 100%). **Admin only.** Fails with `InvalidRoyaltyBps` above the max.

#### `get_default_royalty_bps() -> Option<u32>`
Currently configured default royalty, or `None` if never set.

#### `set_default_royalty_asset(asset: Address) -> Result<(), Error>`
Sets the Stellar Asset Contract (SAC) address royalties are paid in by default (e.g. the native XLM SAC or a USDC SAC). The asset must already be on the allow-list via `add_supported_asset`. **Admin only.** Fails with `UnsupportedAsset` otherwise.

#### `get_default_royalty_asset() -> Option<Address>`
Currently configured default royalty asset, if any.

#### `add_supported_asset(asset: Address) -> Result<(), Error>`
Adds an asset contract address to the admin-approved allow-list of assets that may be used for royalty payouts. **Admin only.**

#### `remove_supported_asset(asset: Address) -> Result<(), Error>`
Removes an asset from the royalty allow-list. **Admin only.**

#### `is_supported_asset(asset: Address) -> bool`
Whether `asset` is currently on the allow-list. Read-only.

#### `pay_royalty(payer: Address, token_id: u64, asset: Address, amount: i128) -> Result<i128, Error>`
Pays the royalty owed on a sale of `token_id` to the token's creator, in `asset`. Requires `payer.require_auth()` and a sufficient `asset` balance. `asset` must be on the allow-list (`UnsupportedAsset` otherwise). The transferred amount is `amount * royalty_bps / 10_000`, using the contract's configured default royalty rate. Returns the amount actually transferred. Emits `royalty_paid`.

---

## 4. Events

All events are published via `env.events().publish(topics, data)`.

| Event | Topics | Data | Emitted by |
|---|---|---|---|
| `mint` | `("mint", to: Address)` | `(token_id: u64, is_soulbound: bool)` | `mint` |
| `transfer` | `("transfer", from: Address, to: Address)` | `token_id: u64` | `transfer`, `transfer_from` |
| `approve` | `("approve", owner: Address, spender: Address)` | `token_id: u64` | `approve` |
| `paused` | `("paused", admin: Address)` | `()` | `pause` |
| `unpaused` | `("unpaused", admin: Address)` | `()` | `unpause` |
| `royalty_paid` | `("royalty_paid", payer: Address, recipient: Address)` | `(asset: Address, token_id: u64, amount: i128)` | `pay_royalty` |

---

## 5. Usage Examples

Examples use the [Stellar CLI](https://developers.stellar.org/docs/tools/developer-tools/cli/stellar-cli) (`stellar contract invoke`) against testnet. Replace `$CONTRACT_ID` with the deployed contract address (see `GET /nfts/contract/info` in the backend API).

### Mint a clip as an NFT (admin)

```bash
stellar contract invoke \
  --id $CONTRACT_ID \
  --source admin \
  --network testnet \
  -- mint \
  --to GC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3 \
  --token_id 42 \
  --clip_id "clip-42" \
  --content_uri "ipfs://QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG" \
  --is_soulbound false
```

### Pause / unpause the contract (admin, emergency response)

```bash
stellar contract invoke --id $CONTRACT_ID --source admin --network testnet -- pause
stellar contract invoke --id $CONTRACT_ID --source admin --network testnet -- is_paused
stellar contract invoke --id $CONTRACT_ID --source admin --network testnet -- unpause
```

### Configure royalties to pay out in USDC instead of XLM

```bash
# USDC SAC address on testnet (issuer-specific — see Stellar Asset List for the current address)
USDC_SAC=CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA

stellar contract invoke --id $CONTRACT_ID --source admin --network testnet \
  -- add_supported_asset --asset $USDC_SAC

stellar contract invoke --id $CONTRACT_ID --source admin --network testnet \
  -- set_default_royalty_asset --asset $USDC_SAC

stellar contract invoke --id $CONTRACT_ID --source admin --network testnet \
  -- set_default_royalty_bps --bps 1000   # 10%
```

### Pay a royalty on a secondary sale

```bash
stellar contract invoke --id $CONTRACT_ID --source buyer --network testnet \
  -- pay_royalty \
  --payer GBUYERADDRESS... \
  --token_id 42 \
  --asset $USDC_SAC \
  --amount 5000000   # 500.0000 USDC (7 decimals) sale price
```

### Query ownership and royalty state

```bash
stellar contract invoke --id $CONTRACT_ID --network testnet -- owner_of --token_id 42
stellar contract invoke --id $CONTRACT_ID --network testnet -- get_default_royalty_bps
stellar contract invoke --id $CONTRACT_ID --network testnet -- get_default_royalty_asset
stellar contract invoke --id $CONTRACT_ID --network testnet -- is_supported_asset --asset $USDC_SAC
```
