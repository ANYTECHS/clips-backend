# ClipCash NFT Contract � Security Audit Preparation

> **Contract:** `clips-nft-contract` v1.0.0
> **Chain:** Stellar / Soroban (SDK 22.0.0)
> **Prepared:** 2026-07-29
> **Status:** ?? Ready for External Audit (findings documented below)

---

## Table of Contents

1. [Audit Scope](#1-audit-scope)
2. [Contract Overview](#2-contract-overview)
3. [Access Control Review](#3-access-control-review)
4. [Overflow Handling Review](#4-overflow-handling-review)
5. [Reentrancy Risk Review](#5-reentrancy-risk-review)
6. [Privileged Functions](#6-privileged-functions)
7. [Storage and Key Collision Analysis](#7-storage-and-key-collision-analysis)
8. [Event Emission Completeness](#8-event-emission-completeness)
9. [Known Findings and Mitigations](#9-known-findings-and-mitigations)
10. [Test Coverage Summary](#10-test-coverage-summary)
11. [Recommendations for Auditors](#11-recommendations-for-auditors)
12. [Audit Checklist](#12-audit-checklist)

---

## 1. Audit Scope

| Item | Value |
|------|-------|
| Contract crate | `contracts/nft-contract/` |
| Entry point | `src/lib.rs` |
| Supporting modules | `src/admin.rs`, `src/storage.rs`, `src/metadata.rs` |
| Test suite | `src/test.rs` (567 lines, 30+ test cases) |
| Soroban SDK | `22.0.0` |
| Rust edition | `2021` |
| `overflow-checks` | **`true`** (release profile) |
| `panic` | `abort` |

**Out of scope for this document:** off-chain NestJS backend (`src/`), Prisma DB, Redis queues.
The backend's interaction surface with this contract is documented in Section 11.

---

## 2. Contract Overview

The `ClipsNftContract` is a Soroban-native NFT contract implementing:

- **Soulbound flag** � tokens marked `is_soulbound = true` are non-transferable and cannot be approved for delegation.
- **Admin-gated minting** � only the stored `admin` address may call `mint`.
- **Single-approval model** � one approved spender per token; approval is consumed on `transfer_from`.
- **Royalty BPS** � configurable default royalty (0�10 000 BPS) stored in instance storage.
- **Creator provenance** � `creator` is set to the initial `to` address at mint and never changes.

### Public Entry Points

| Function | Caller Auth | Admin-gated |
|---|---|---|
| `initialize(admin)` | none (first-caller wins) | � |
| `mint(to, token_id, clip_id, content_uri, is_soulbound)` | admin | YES |
| `transfer(from, to, token_id)` | token owner (`from`) | NO |
| `transfer_from(spender, from, to, token_id)` | approved spender | NO |
| `approve(owner, spender, token_id)` | token owner (`owner`) | NO |
| `set_default_royalty_bps(bps)` | admin | YES |
| `owner_of(token_id)` | public read | NO |
| `get_token_data(token_id)` | public read | NO |
| `is_soulbound(token_id)` | public read | NO |
| `get_creator(token_id)` | public read | NO |
| `balance_of(owner)` | public read | NO |
| `total_supply()` | public read | NO |
| `get_approved(token_id)` | public read | NO |
| `get_default_royalty_bps()` | public read | NO |

---

## 3. Access Control Review

### 3.1 Initialization Guard

**Location:** `src/lib.rs` lines 54-60

```rust
pub fn initialize(env: Env, admin: Address) -> Result<(), Error> {
    if storage::has_admin(&env) {
        return Err(Error::AlreadyInitialized);
    }
    storage::set_admin(&env, &admin);
    Ok(())
}
```

**Assessment:** PASS. The `AlreadyInitialized` guard prevents re-initialization.

**Finding AC-01 (Medium):** `initialize` does **not** call `admin.require_auth()`. Any address can call
`initialize` with any `admin` value **before** the real deployer does. On Soroban this is a race condition
� whoever calls `initialize` first controls the contract.

See Section 9.1 for the full finding and recommended fix.

---

### 3.2 Mint Authorization

**Location:** `src/lib.rs` lines 70-71

```rust
let admin = storage::get_admin(&env).ok_or(Error::NotInitialized)?;
admin.require_auth();
```

**Assessment:** PASS. Only the stored admin can invoke `mint`. Soroban's `require_auth()` enforces
on-ledger authorization � no off-chain bypass is possible.

---

### 3.3 Transfer Authorization

**Location:** `src/lib.rs` line 103

```rust
from.require_auth();
// ...
if token_data.owner != from { return Err(Error::Unauthorized); }
```

**Assessment:** PASS. Dual check: (1) `from` must authorize the call, (2) `from` must be the stored owner.
Both are required � passing auth but wrong owner, or right owner without auth, both fail.

---

### 3.4 `transfer_from` Approval Check

**Location:** `src/lib.rs` lines 141-143

```rust
if !storage::is_approved(&env, token_id, &spender) && token_data.owner != spender {
    return Err(Error::Unauthorized);
}
```

**Assessment:** PASS. Spender must be either (a) the approved address or (b) the owner themselves.
`spender.require_auth()` is called on line 133.

---

### 3.5 Soulbound Enforcement

**Location:** `src/lib.rs` lines 111-113, 145-147, 171-173

Soulbound tokens reject:
- `transfer` returns `SoulboundTokenNotTransferable`
- `transfer_from` returns `SoulboundTokenNotTransferable`
- `approve` returns `SoulboundTokenNotTransferable`

**Assessment:** PASS. All three transfer vectors are blocked.

---

### 3.6 Admin Transfer / Rotation

**Finding AC-02 (Low):** There is **no `set_admin` or `transfer_admin` function**. Once `admin` is set
via `initialize`, it can never be changed without contract re-deployment.

See Section 9.2 for the full finding and recommended fix.

---

## 4. Overflow Handling Review

### 4.1 Compile-time Overflow Checks

**Location:** `Cargo.toml` line 22

```toml
[profile.release]
overflow-checks = true
```

**Assessment:** PASS. All integer arithmetic in the release binary is compiled with overflow panics.
Soroban's `panic = "abort"` means overflows abort the transaction cleanly � no undefined behaviour.

---

### 4.2 `total_supply` Increment

**Location:** `src/storage.rs` lines 64-67

```rust
pub fn increment_total_supply(env: &Env) {
    let current = get_total_supply(env);
    env.storage().instance().set(&Symbol::new(env, TOTAL_SUPPLY_KEY), &(current + 1));
}
```

**Assessment:** PASS. `u64` with `overflow-checks = true`. Overflow would abort at 2^64 - 1 tokens �
practically unreachable.

---

### 4.3 Royalty BPS Arithmetic

**Location:** `src/lib.rs` lines 221-223

```rust
if bps > storage::ROYALTY_BPS_MAX {
    return Err(Error::InvalidRoyaltyBps);
}
```

`ROYALTY_BPS_MAX = 10_000` (u32). Range validation is explicit before storage.
Off-chain royalty calculation `price * bps / 10_000` is performed in the NestJS backend,
not in the contract itself.

**Assessment:** PASS. Bounds checked. Royalty application arithmetic is not enforced on-chain
(by design � Soroban does not natively execute royalty enforcement during transfers).

---

### 4.4 `balance_of` Cast

**Location:** `src/lib.rs` line 199

```rust
storage::get_owner_tokens(&env, &owner).len() as u64
```

**Assessment:** PASS. `Vec::len()` returns `u32` on Soroban; the `as u64` widening cast is safe.

---

### 4.5 Royalty Multiplication Overflow (Issue #689)

**Location:** `src/lib.rs` — `calculate_fractional_royalty`, `transfer_with_royalty`, `pay_royalty_with_asset`.

Three call sites multiply an unbounded, caller-supplied `sale_price` / `amount` by `royalty_bps`
before dividing by `ROYALTY_BPS_MAX`. `overflow-checks = true` (4.1) would abort the whole
transaction on overflow in a release build, but that's an opaque panic rather than a typed error,
and the previous `pay_royalty_with_asset` used `saturating_mul`, which does *not* panic — it
silently clamps to the type's max value and would have paid out a nonsensical royalty amount.
All three sites now use `checked_mul` and return `Error::RoyaltyOverflow` explicitly:

| Function | Arithmetic type | Overflows only when `sale_price` / `amount` exceeds |
|---|---|---|
| `calculate_fractional_royalty` | `u128` | `u128::MAX / 10_000` (~3.4 × 10³⁴) |
| `transfer_with_royalty` | `u64` | `u64::MAX / 10_000` (~1.84 × 10¹⁵ stroops, ~184M XLM) |
| `pay_royalty_with_asset` | `i128` | `i128::MAX / 10_000` (~1.7 × 10³⁴) |

`royalty_bps` is bounds-checked to `ROYALTY_BPS_MAX` (10 000) before the multiplication in all
three functions, so these are the only overflow conditions possible.

**Assessment:** PASS. Extreme values are rejected with a typed `Error::RoyaltyOverflow` instead of
an opaque panic or a silently-clamped payout. Covered by
`test_fractional_royalty_overflow_is_rejected`, `test_transfer_with_royalty_overflow_is_rejected`,
and `test_pay_royalty_with_asset_overflow_is_rejected` in `src/test.rs`.

---

## 5. Reentrancy Risk Review

### 5.1 Soroban Execution Model

Soroban smart contracts run in a **deterministic WASM sandbox**. Unlike EVM contracts, Soroban has
**no concept of mid-execution callbacks or external calls** from within a contract invocation.
Re-entrancy as understood in the EVM context is not possible in the Soroban execution model.

**Assessment:** PASS. No reentrancy risk. All state mutations happen atomically within a single transaction envelope.

---

### 5.2 State Update Ordering (Checks-Effects Pattern)

Even though reentrancy is impossible, the contract follows the checks-effects-interactions pattern
as best practice:

| Function | Order |
|---|---|
| `transfer` | auth check ? owner check ? soulbound check ? remove_owner_token ? set_owner_token ? set_token ? emit event |
| `transfer_from` | auth check ? owner check ? approval check ? soulbound check ? storage updates ? remove_approval ? emit event |
| `approve` | auth check ? owner check ? soulbound check ? set_approval ? emit event |
| `mint` | auth check ? duplicate check ? storage writes ? increment_total_supply ? emit event |

**Assessment:** PASS. All state is fully committed before events are emitted.

---

## 6. Privileged Functions

The following functions require admin authorization (`admin.require_auth()`). These are the
highest-risk entry points and should be the focus of access control review during audit.

| Function | Risk | Notes |
|---|---|---|
| `initialize(admin)` | Critical | One-shot; sets the admin forever. Subject to frontrunning (AC-01). |
| `mint(to, token_id, ...)` | High | Creates tokens. Admin can mint to any address, set any `clip_id`/`content_uri`. No on-chain URI format validation. |
| `set_default_royalty_bps(bps)` | Medium | Affects all future royalty calculations. Can be set to 0 or 10 000 (100%). |

### Privileged Deployment Sequence

1. `stellar contract deploy` � obtains `CONTRACT_ID`
2. `stellar contract invoke initialize --admin <ADMIN_ADDRESS>` � **must be called atomically/immediately post-deploy**
3. Off-chain backend reads `CONTRACT_ID` from environment and routes mint calls through the admin key

> **FINDING AC-01 (Medium):** The gap between deploy and `initialize` is a frontrunning window.
> Mitigate by using Soroban's `--source` flag to make deploy + initialize a single transaction,
> or by using a deployment script that atomically deploys and initializes.
> Review `deploy-mainnet.sh` to verify it calls `initialize` in the same invocation sequence.

---

## 7. Storage and Key Collision Analysis

### 7.1 Key Inventory

| Key | Storage Tier | Type | Value |
|---|---|---|---|
| `"admin"` | Instance | `Address` | Admin address |
| `"total_supply"` | Instance | `u64` | Total tokens minted |
| `"def_royalty_bps"` | Instance | `u32` | Default royalty BPS |
| `token_id: u64` | Persistent | `TokenData` | Full token record |
| `owner: Address` | Persistent | `Vec<u64>` | Token ID list for owner |
| `(token_id, "approval")` | Persistent | `Address` | Approved spender |
| `(token_id, "metadata")` | Persistent | `ClipMetadata` | Extended metadata |

### 7.2 Instance vs Persistent Storage TTL

**FINDING ST-01 (Low):** Instance storage entries (`admin`, `total_supply`, `def_royalty_bps`) are
subject to Soroban's instance TTL archival. If the contract's instance storage expires, these values
become inaccessible until restored. No `extend_ttl` calls are present. In production, a keepalive
bot or governance process must periodically extend the contract's instance TTL.

### 7.3 Persistent Storage Per-entry TTL

**FINDING ST-02 (Low):** Persistent entries (`TokenData`, owner Vec, approvals, metadata) each have
their own TTL. Large collections risk individual entries expiring. No per-entry TTL extension on
read or write. Consider extending TTL on every `set_token` and `set_owner_token` call.

### 7.4 No Key Conflicts

The compound key `(token_id, Symbol)` for approvals and metadata is structurally separate from the
bare `token_id` key for token data. No collision risk identified.

**Assessment:** PASS.

---

## 8. Event Emission Completeness

| Event | Topics | Data | Status |
|---|---|---|---|
| `mint` | `("mint", to)` | `(token_id, is_soulbound)` | PASS |
| `transfer` | `("transfer", from, to)` | `token_id` | PASS |
| `approve` | `("approve", owner, spender)` | `token_id` | PASS |
| `set_default_royalty_bps` | � | � | MISSING |

**FINDING EV-01 (Low):** `set_default_royalty_bps` does not emit an event. Off-chain indexers
cannot detect royalty changes without polling. A `royalty_updated` event should be added.

---

## 9. Known Findings and Mitigations

### 9.1 AC-01: `initialize` Frontrunning (Medium)

**Description:** `initialize` does not require auth from the `admin` argument. Any actor who
observes the deploy transaction can immediately call `initialize` with a malicious admin address
before the legitimate deployer does.

**Impact:** Total contract takeover � malicious admin controls minting.

**Likelihood:** Low in practice (requires monitoring the mempool and acting faster than the deployer),
but non-zero on high-traffic networks.

**Recommended Fix:**

```rust
pub fn initialize(env: Env, admin: Address) -> Result<(), Error> {
    if storage::has_admin(&env) {
        return Err(Error::AlreadyInitialized);
    }
    admin.require_auth();          // ADD THIS LINE
    storage::set_admin(&env, &admin);
    Ok(())
}
```

Alternatively, bundle deploy + initialize in one transaction using `stellar contract deploy --invoke-args`.

**Status:** OPEN � requires code change before mainnet deployment.

---

### 9.2 AC-02: No Admin Key Rotation (Low)

**Description:** There is no mechanism to rotate or transfer the admin address post-initialization.

**Impact:** If the admin private key is compromised or lost, the contract is permanently broken
(no new mints can be authorized). Recovery requires full redeployment.

**Recommended Fix:**

```rust
pub fn transfer_admin(env: Env, new_admin: Address) -> Result<(), Error> {
    let admin = storage::get_admin(&env).ok_or(Error::NotInitialized)?;
    admin.require_auth();
    storage::set_admin(&env, &new_admin);
    events::emit_admin_transferred(&env, &admin, &new_admin);
    Ok(())
}
```

**Status:** DEFERRED � acceptable for v1 if admin key is a hardware-secured multisig.

---

### 9.3 ST-01 / ST-02: No TTL Extension (Low)

**Description:** Soroban storage entries expire unless their TTL is periodically extended.
The contract has no `extend_ttl` calls.

**Impact:** After approximately `max_entry_ttl` ledgers without activity, instance and persistent
entries may be archived, making the contract non-functional until restored.

**Recommended Fix:**

- Add `env.storage().instance().extend_ttl(MIN_TTL, MAX_TTL)` to all write functions.
- Add `env.storage().persistent().extend_ttl(&key, MIN_TTL, MAX_TTL)` on every `set_token` and `set_owner_token`.
- Operate a keepalive bot that periodically calls a no-op function to extend the instance TTL.

**Status:** OPEN � critical for long-term mainnet operation.

---

### 9.4 EV-01: Missing `royalty_updated` Event (Low)

**Description:** `set_default_royalty_bps` silently writes to storage without emitting an event.

**Impact:** Off-chain indexers, marketplaces, and audit trails cannot detect royalty configuration
changes without polling.

**Recommended Fix:**

```rust
// In events mod:
pub fn emit_royalty_updated(env: &Env, old_bps: u32, new_bps: u32) {
    let topics = (Symbol::new(env, "royalty_updated"),);
    env.events().publish(topics, (old_bps, new_bps));
}
```

**Status:** OPEN � low risk, should be resolved before mainnet for transparency.

---

### 9.5 DATA-01: No On-chain URI Validation (Informational)

**Description:** `content_uri` and `clip_id` are accepted as arbitrary `soroban_sdk::String` values
with no format validation.

**Impact:** An admin could mint tokens with empty URIs or malformed URIs. Integrity depends entirely
on the off-chain backend enforcing URI format.

**Status:** INFORMATIONAL � acceptable for v1 with trusted admin.

---

### 9.6 DATA-02: `creator` Always Equals Initial `to` (Informational)

**Description:** At mint time, `creator` is set to `to.clone()` (lib.rs line 77). The NFT creator
is always the first recipient, which may not match real-world creator attribution when minting to
a marketplace escrow address.

**Impact:** Royalty recipient attribution could be incorrect if the off-chain system mints to a
non-creator wallet.

**Status:** INFORMATIONAL � a design decision. The backend must always pass the actual creator's
wallet as `to`. Consider adding a separate `creator` parameter to `mint` for future flexibility.

---

## 10. Test Coverage Summary

The test suite (`src/test.rs`) covers **30 test cases** across the following scenarios:

| Category | Test Count | Status |
|---|---|---|
| Initialization (success + double-init rejection) | 2 | COVERED |
| Mint success (regular, soulbound, multi-token) | 3 | COVERED |
| Mint rejection (duplicate ID, no auth, not initialized) | 3 | COVERED |
| Royalty BPS (read, write, boundary, overflow, auth) | 7 | COVERED |
| Royalty calculation (pure math, edge cases) | 5 | COVERED |
| Transfer (success, soulbound rejection, not-found, non-owner) | 4 | COVERED |
| Approve + `transfer_from` (success, soulbound, unapproved) | 3 | COVERED |
| Query helpers (owner_of, get_token_data, creator, balance) | 3 | COVERED |
| `initialize` frontrunning (admin.require_auth not called) | 0 | MISSING |
| TTL behaviour under simulated expiry | 0 | MISSING |
| `transfer_admin` (not yet implemented) | 0 | MISSING |
| `royalty_updated` event emission | 0 | MISSING |

---

## 11. Recommendations for Auditors

### Off-chain to On-chain Trust Boundary

The NestJS backend (`src/nft/`) interacts with this contract via the Stellar Soroban RPC.
Key trust assumptions auditors should be aware of:

1. **Admin key custody** � The private key corresponding to the `admin` address used in `initialize`
   is held by the backend operator. It is never transmitted over the network; the backend signs
   transactions server-side. Auditors should verify `STELLAR_SECRET_KEY` is loaded from secrets
   management (not hardcoded in source or `.env`).

2. **`mint` invocation** � The backend's `NftService.mintClip()` calls `mint` after validating
   clip ownership and status via `NftMintGuard`. The guard is enforced at the HTTP layer, not
   on-chain. On-chain, only the admin auth check applies.

3. **Signature verification for `prepare-mint`** � `MintSignatureVerificationService` verifies an
   Ed25519 wallet signature before building the XDR. This prevents unauthorized users from
   preparing mint transactions on behalf of others but does **not** substitute for on-chain auth.

4. **Royalty enforcement** � Royalty BPS is configured on-chain but royalty collection occurs
   off-chain. Secondary marketplaces are not forced by the contract to honour royalties.

### Open Questions for Auditors

- Is the `AlreadyInitialized` guard sufficient to protect against frontrunning given Soroban's
  transaction ordering guarantees?
- Are there any XDR serialization edge cases in `TokenData` or `ClipMetadata` that could be exploited?
- Does the `(token_id, Symbol::new(env, "approval"))` compound key provide sufficient collision
  resistance across all Soroban SDK versions?
- Are there any denial-of-service vectors in `get_owner_tokens` that iterates over the owner's token Vec?
- What is the maximum practical Vec size for `get_owner_tokens` before gas limits are exceeded?

---

## 12. Audit Checklist

### Pre-Audit (Internal � track before sending to auditors)

- [x] Access control review complete
- [x] Overflow handling review complete
- [x] Reentrancy risk review complete
- [x] Privileged functions documented
- [x] Storage key inventory complete
- [x] Event emission review complete
- [x] Findings documented with severity ratings
- [x] Test coverage mapped
- [ ] **AC-01 fix merged** � `admin.require_auth()` added to `initialize`
- [ ] **ST-01/ST-02 fix merged** � `extend_ttl` calls added to write functions
- [ ] **EV-01 fix merged** � `royalty_updated` event added to `set_default_royalty_bps`
- [ ] Deploy scripts reviewed for atomic initialize pattern
- [ ] Admin private key stored in secrets manager (not committed `.env` file)
- [ ] Soroban SDK dependency pinned to exact version (no range specifiers)
- [ ] Contract WASM size within Soroban deployment limits verified

### Auditor Review (complete during external audit)

- [ ] Access control � all `require_auth()` call sites verified
- [ ] Storage key collision analysis complete
- [ ] Event completeness verified
- [ ] Arithmetic safety confirmed
- [ ] Soroban-specific risks (TTL archival, WASM resource limits) assessed
- [ ] Off-chain trust boundary assumptions validated
- [ ] Final audit report delivered
- [ ] All Critical/High findings resolved and re-verified
- [ ] Re-audit scheduled if significant code changes were required

---

## Appendix: Swagger / API Admin Endpoint Reference

Admin-sensitive API endpoints in the NestJS backend are documented in the Swagger UI at `/api/docs`
(non-production only, or when `ENABLE_SWAGGER_UI=true`). All endpoints below that require JWT auth
are protected by `LoginGuard`.

| Endpoint | Method | Auth Required | Admin-Only | Security Notes |
|---|---|---|---|---|
| `POST /nfts/mint` | POST | NftMintGuard | YES (server-held admin key) | Triggers on-chain `mint` using the admin Stellar private key. Must never be exposed to untrusted callers. Rate-limited: 5 req / 60 s. |
| `POST /nfts/prepare-mint` | POST | JWT + NftMintGuard | NO | Builds unsigned XDR for user signing. Validates clip ownership. Rate-limited: 5 req / 60 s. |
| `POST /nfts/confirm-mint` | POST | JWT | NO | Confirms on-chain mint record in the database. Validates caller owns the clip. |
| `POST /nfts/verify-ownership` | POST | None | NO | Public. Queries on-chain `owner_of`. No sensitive data exposed. |
| `GET /nfts/:clipId/metadata` | GET | None | NO | Public. Returns OpenSea-compatible NFT metadata. Platform wallet is masked. |
| `GET /nfts/:mintAddress/royalty` | GET | JWT | NO | Reads on-chain royalty info. Result cached in Redis for 5 min. |
| `GET /nfts/contract/info` | GET | None | NO | Public. Returns contract ID, network, and RPC URL. |
| `POST /nft/batch-royalty` | POST | @Public() override | NO | Bypasses JWT via `@Public()`. Validate rate limiting is active. |
| `GET /platform/revenue` | GET | @Public() override | NO | Bypasses JWT via `@Public()`. Returns aggregated platform fees. |

> **Security Warning:** `POST /nfts/mint` invokes the Soroban contract using the **server-held admin
> private key**. Ensure `NftMintGuard` and rate limiting (`@Throttle({ nftMint: { limit: 5, ttl: 60000 } })`)
> are active at all times. This endpoint should not appear in the Swagger UI on production
> (`ENABLE_SWAGGER_UI` must be unset or `false`).

> **Security Warning:** `@Public()` on `POST /nft/batch-royalty` and `GET /platform/revenue` means
> these endpoints bypass JWT authentication entirely. Confirm their underlying services enforce
> appropriate rate limits and do not leak sensitive financial data.

---

*Document maintained by the ClipCash engineering team.*
*Update this file whenever the contract source changes.*
*Re-run the pre-audit checklist after each material modification.*
