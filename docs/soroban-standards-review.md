# Soroban Contract Standards Review — Issue #1064

**Date:** 2026-09-30  
**Reviewer:** Kiro (automated review)  
**Scope:** ClipCash NFT contract implementation (`src/nft/`) against Stellar/Soroban
standards and relevant cross-chain precedents.

---

## 1. Applicable Standards

### SEP-0010 — Stellar Web Authentication

**Purpose:** Defines a challenge-response authentication protocol using Stellar
transactions so a backend can verify that a user controls a given Stellar keypair
without the user ever sending a real on-chain transaction.

**Relevance to ClipCash:** Any endpoint that requires the caller to prove wallet
ownership before executing a mint, transfer, or royalty-recipient update should
gate access through SEP-0010. The standard is already referenced in the wallet
integration docs but has not been wired into the NFT controller guards.

Key fields returned by a compliant SEP-0010 challenge:

| Field | Description |
|---|---|
| `transaction` | Base64-encoded XDR challenge transaction |
| `network_passphrase` | Stellar network the challenge applies to |

### SEP-0039 — On-chain Metadata Standard (draft)

**Purpose:** A draft SEP that standardises the JSON metadata schema attached to
Stellar-based NFTs so wallets, explorers, and marketplaces can display them
consistently.

**Core required fields:**

| Field | Type | Description |
|---|---|---|
| `name` | `string` | Human-readable token name |
| `description` | `string` | Token description |
| `image` | `string` (URI) | Static display image |
| `animation_url` | `string` (URI) | Optional video/audio asset |
| `attributes` | `array` | Trait array (`trait_type`, `value`) |

ClipCash extends this with ClipCash-specific fields (`viralityScore`,
`originalDuration`, etc.) which are kept in top-level properties and inside
`attributes`.

### SEP-0040 — Token Interface Standard

**Purpose:** Defines the canonical Soroban contract interface for fungible and
non-fungible tokens so clients, wallets, and indexers can interact with any
compliant token contract using a single ABI.

**NFT-relevant interface functions:**

| Function | Signature | Description |
|---|---|---|
| `name` | `() -> String` | Collection name |
| `symbol` | `() -> String` | Token symbol |
| `token_uri` | `(token_id: u64) -> String` | Per-token metadata URI |
| `owner_of` | `(token_id: u64) -> Address` | Current token owner |
| `transfer` | `(from: Address, to: Address, token_id: u64)` | Transfer token |
| `approve` | `(caller: Address, operator: Address, token_id: u64, expiry: u32)` | Grant single-token approval |
| `set_approval_for_all` | `(caller: Address, operator: Address, approved: bool)` | Grant collection-wide approval |
| `get_approved` | `(token_id: u64) -> Option<Address>` | Query single approval |
| `is_approval_for_all` | `(owner: Address, operator: Address) -> bool` | Query collection approval |

### CAP-54 — Soroban Contract Lifecycle

**Purpose:** Specifies how Soroban contracts are deployed, upgraded (WASM hash
replacement), and how contract storage entries expire/are extended via
`ExtendFootprintTTL` operations.

**Key lifecycle phases:**

| Phase | Description |
|---|---|
| Upload | WASM bytecode uploaded to the network ledger |
| Deploy | Contract instance created at a deterministic address |
| Upgrade | Contract WASM replaced via `update_current_contract_wasm` |
| Expiry | Ledger entries expire after `max_entry_expiration` ledgers unless extended |

**Impact on ClipCash:** The upgrade procedure documented in
`docs/soroban-upgrades.md` is well-aligned with CAP-54 but does not yet address
automatic TTL extension (bump/extend footprint) for long-lived token storage
entries, which is required to prevent NFT state from expiring on mainnet.

### ERC-2981 — NFT Royalty Standard (Ethereum precedent)

Although ERC-2981 is an Ethereum standard, it defines the BPS-based royalty
pattern (basis points, receiver address, calculation formula) that the Soroban
contract mirrors. ClipCash's royalty implementation follows ERC-2981 semantics
precisely:

- Royalties expressed in **basis points** (100 bps = 1%).
- `royaltyInfo(tokenId, salePrice)` → `(receiver, royaltyAmount)` semantics
  replicated by `RoyaltyConfigurationService.calculateRoyalty`.
- Integer-division truncation toward zero matching the Soroban contract's
  `calculate_royalty` helper.

---

## 2. Current Implementation Review

### 2.1 NftMetadata JSON (`NftMetadataService` / `IpfsUploadService`)

The `NftMetadata` interface and `NftMetadataService.build()` produce a
JSON object with the following fields:

```typescript
{
  name: string;               // clip.title || `Clip #${clip.id}`
  description: string;        // clip.caption || default string
  image: string;              // clip.thumbnail ?? clip.clipUrl
  animation_url: string;      // clip.clipUrl
  external_url?: string;      // not currently populated
  attributes: NftMetadataAttribute[];
  seller_fee_basis_points: number;  // royaltyBps (OpenSea-compatible)
  fee_recipient?: string;           // royaltyRecipient (OpenSea-compatible)
  royalty: NftRoyaltyInfo;          // ClipCash-specific block
  viralityScore?: number;
  originalDuration?: number;
  createdAt?: string;
}
```

All four SEP-0039 required fields (`name`, `description`, `image`,
`animation_url`) are present and correctly populated.

### 2.2 Royalty Implementation (`RoyaltyConfigurationService`)

- Royalties use basis points (0–10 000 range enforced by validators).
- Per-clip cap: `CLIP_ROYALTY_BPS_MAX = 1500` (15%).
- Protocol-wide combined cap: `DEFAULT_ROYALTY_BPS_MAX = 10000` (100%).
- `calculateRoyalty` uses `BigInt` arithmetic to prevent IEEE-754 precision loss
  on large sale prices — matches the Soroban contract's integer-division
  semantics exactly.
- `buildRoyaltyMap` serialises recipient addresses as `Address.toScVal()` and
  BPS values as `nativeToScVal(bps, { type: 'u32' })` — compatible with the
  expected Soroban `Map<Address, u32>` argument type.

### 2.3 Contract ID Handling (`NftService`, `NftConfig`)

- Contract ID is read from `SOROBAN_NFT_CONTRACT_ID` environment variable.
- No validation of the contract ID string at startup (should use
  `StrKey.isValidContract()`).
- The `soroban-contract.controller.ts` exposes read-only `info` / `version`
  endpoints that return the configured contract ID.

### 2.4 Token URI (`NftService.getTokenUri`)

- Default URI: `https://clips.cash/metadata/{tokenId}` — uses token ID as
  path segment rather than IPFS CID. After minting, the IPFS URI should become
  the canonical `token_uri` value.
- `updateTokenUri` is one-time-updateable per token, enforced in-memory only
  (lost on service restart).

### 2.5 Approval Model (`NftApprovalService`)

- `approve`, `set_approval_for_all`, `get_approved`, `is_approval_for_all`
  are implemented in-memory.
- Mirrors SEP-0040 / EIP-721 approval functions.

### 2.6 Transfer (`NftTransferService`)

- `transfer` and `transfer_from` operations are implemented.
- Transfer history is tracked in-memory (not persisted to database).

### 2.7 Burn (`NftService`)

- Burn endpoint exists (`DELETE /nfts/:id`).
- Only the token owner can burn.

---

## 3. Compatibility Gaps

| # | Area | Gap | Severity |
|---|---|---|---|
| G-1 | Contract ID validation | `SOROBAN_NFT_CONTRACT_ID` is not validated at startup using `StrKey.isValidContract()` | High |
| G-2 | SEP-0010 wallet auth | NFT write endpoints do not require SEP-0010 challenge verification | High |
| G-3 | Token URI persistence | Custom `tokenUri` overrides are stored in-memory only; lost on restart | High |
| G-4 | CAP-54 TTL extension | No `ExtendFootprintTTL` operations are issued for long-lived token entries | Medium |
| G-5 | SEP-0040 `name()` / `symbol()` | Collection-level `name` and `symbol` contract functions are not exposed via backend | Medium |
| G-6 | `external_url` field | SEP-0039 `external_url` field is typed but never populated | Low |
| G-7 | Approval persistence | Approval state stored in-memory only | Medium |
| G-8 | `token_uri` after mint | Token URI defaults to HTTPS path; IPFS URI not automatically set as on-chain token_uri | High |
| G-9 | Royalty recipient validation | Recipient address strings are not validated as Stellar public keys before being written | Medium |
| G-10 | Idempotency key | Mint idempotency is checked via DB (`preventDoubleMint`) but no idempotency token is accepted in the request | Low |

---

## 4. Implemented Features

| Feature | Implementation | Standard Reference |
|---|---|---|
| SEP-0039 required metadata fields | `NftMetadata`: `name`, `description`, `image`, `animation_url` | SEP-0039 |
| BPS-based royalties | `RoyaltyConfigurationService` + `checkedRoyaltyAmount` | ERC-2981 |
| Royalty map serialisation | `buildRoyaltyMap` → `Address.toScVal()` + `nativeToScVal(bps, 'u32')` | SEP-0040 |
| Per-token royalty recipient update | `updateRoyaltyRecipient` | ERC-2981 |
| Single-use metadata update | `updateMetadata` (one update per token) | SEP-0039 |
| Token approval (single & collection) | `NftApprovalService` | SEP-0040 |
| Token transfer | `NftTransferService` | SEP-0040 |
| Token burn | `NftService` burn endpoint | SEP-0040 |
| Batch mint | `batchMintClips` (up to 50 per call) | — |
| Gas / instruction tracking | `GasMetricsService.recordBenchmark` | CAP-54 |
| Contract upgrade orchestration | `scripts/soroban-upgrade.sh` + adapter interface | CAP-54 |
| Network switching (testnet / mainnet) | `STELLAR_NETWORK` env var in `StellarService` | — |
| IPFS metadata upload | `IpfsUploadService` (Pinata + nft.storage) | SEP-0039 |
| Overflow-safe royalty arithmetic | `BigInt`-based `checkedRoyaltyAmount` | ERC-2981 |
| Mint idempotency (DB) | `preventDoubleMint` in `ClipsService` | — |

---

## 5. Unsupported Features with Rationale

| Feature | Standard | Rationale for Omission |
|---|---|---|
| On-chain SEP-0010 challenge/verify flow in NFT guards | SEP-0010 | Authentication is currently handled by JWT middleware at the application layer. SEP-0010 adds a second Stellar-native layer that is important for trustless wallet verification but requires additional UX (wallet signature prompt) not yet designed. |
| `ExtendFootprintTTL` (CAP-54 TTL bumping) | CAP-54 | TTL extension requires issuing on-chain transactions during every read/write. This is a backend orchestration concern deferred until the Soroban contract is deployed and tested on mainnet. |
| Collection-level `name()` / `symbol()` via contract call | SEP-0040 | These values are currently served from environment config. Calling the contract for static values adds RPC latency with no user-facing benefit at this stage. |
| On-chain transfer hook / royalty enforcement | SEP-0040 | Soroban does not yet have universal transfer-hook standards. Royalty enforcement relies on marketplace cooperation (same as ERC-2981). |
| Enumeration (`tokens_of_owner`, `total_supply`) | SEP-0040 | Enumerable extensions are not part of the core SEP-0040 minimum interface. They are planned for a future indexer integration. |
| Permit (gasless approval) | EIP-2612 analogue | No Soroban equivalent is standardised. Deferred. |

---

## 6. Recommended Changes

### R-1 — Validate contract ID at startup (fixes G-1)

```typescript
// src/nft/nft.module.ts or bootstrap
import { StrKey } from '@stellar/stellar-sdk';

const contractId = configService.sorobanNftContractId;
if (!StrKey.isValidContract(contractId)) {
  throw new Error(`SOROBAN_NFT_CONTRACT_ID "${contractId}" is not a valid Soroban contract StrKey`);
}
```

### R-2 — Validate royalty recipient addresses (fixes G-9)

In `updateRoyaltyRecipient` and `buildRoyaltyMap`, validate that any wallet
string passed in is a valid Stellar Ed25519 public key:

```typescript
import { StrKey } from '@stellar/stellar-sdk';

if (!StrKey.isValidEd25519PublicKey(newRecipient)) {
  throw new BadRequestException(`Invalid Stellar address: ${newRecipient}`);
}
```

`RoyaltyConfigurationService.validateRoyaltyConfiguration` already does this
for the platform wallet — apply the same check to creator wallets.

### R-3 — Persist token URIs and approvals to database (fixes G-3, G-7)

Replace the in-memory `Map`/`Set` in `NftService` and `NftApprovalService` with
Prisma-backed persistence. Add `tokenUri` and `approvals` tables (or columns) to
`prisma/schema.prisma`.

### R-4 — Set IPFS URI as canonical token_uri after mint (fixes G-8)

After `IpfsUploadService.upload()` succeeds, call `updateTokenUri(tokenId, metadataUri)`
so the canonical token URI points to the immutable IPFS content rather than the
mutable HTTPS endpoint.

### R-5 — Populate `external_url` (fixes G-6)

```typescript
external_url: `https://clips.cash/clips/${clip.id}`,
```

### R-6 — Add CAP-54 TTL extension before mainnet launch (fixes G-4)

Issue `ExtendFootprintTTL` operations alongside every `mint` and `transfer`
invocation to keep NFT storage alive indefinitely.

### R-7 — Wire SEP-0010 into NFT write endpoints (fixes G-2)

Require a `X-Stellar-Auth` header containing a signed SEP-0010 challenge response
on `POST /nfts/:id/mint`, `PATCH /nfts/:id/token-uri`, and
`PATCH /nfts/:id/royalty-recipient`.

---

## 7. Summary Table

| Standard | Compliance Level | Notes |
|---|---|---|
| SEP-0010 | ⚠️ Partial | JWT auth only; Stellar wallet auth not integrated in NFT guards |
| SEP-0039 | ✅ Core fields | Required fields populated; `external_url` missing |
| SEP-0040 | ✅ Core interface | All core functions present; persistence gaps exist |
| CAP-54 | ✅ Lifecycle | Upgrade script present; TTL extension not yet implemented |
| ERC-2981 | ✅ Fully compliant | BPS royalties, overflow-safe arithmetic, recipient management |

---

*This document was generated as part of issue #1064 — Soroban Contract Standards Review.*
