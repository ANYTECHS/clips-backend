use soroban_sdk::{Address, BytesN, Env, Map, Symbol, Vec};

use crate::TokenData;

pub struct TokenStorage;

// ── Compact storage keys (issue #642) ──────────────────────────────────────
// Short keys reduce per-entry storage footprint and RPC read latency.
const TOTAL_SUPPLY_KEY: &str = "ts";
const ADMIN_KEY: &str = "adm";
const DEFAULT_ROYALTY_BPS_KEY: &str = "drb";
const PAUSED_KEY: &str = "paused";
const DEFAULT_ROYALTY_ASSET_KEY: &str = "def_royalty_asset";
const SUPPORTED_ASSETS_KEY: &str = "supported_assets";

/// Maximum allowed royalty value in basis points (100% = 10 000 BPS).
//! Storage helpers for the ClipCash NFT contract.
//!
//! ## Issue #677 — Storage Optimization for Scale
//!
//! All persistent per-token keys are encoded via the `DataKey` enum which is
//! annotated with `#[contracttype]`. Soroban serialises enum variants as a
//! compact XDR union discriminant + optional payload, which is **significantly
//! smaller** than the previous approach of constructing `(token_id,
//! Symbol::new(env, "some_long_string"))` tuples at runtime:
//!
//! | Key type          | Old encoding (approx bytes) | New encoding (approx bytes) |
//! |-------------------|-----------------------------|-----------------------------|
//! | Token data        | u64 (8 B)                   | `DataKey::Token(u64)` ≈ 9 B |
//! | Approval          | tuple (u64, Symbol≈9B) ≈ 17B| `DataKey::Approval(u64)` ≈ 9B |
//! | Per-token royalty | tuple (u64, Symbol≈11B) ≈ 19B| `DataKey::RoyaltyBps(u64)` ≈ 9B |
//! | Owner list        | raw Address (≈ 36 B)        | `DataKey::OwnerTokens(Address)` |
//!
//! For a 10 000 NFT collection this saves roughly **80–120 KB** of ledger
//! storage and reduces per-entry Soroban RPC read overhead.
//!
//! Instance-level (global) keys remain as short `Symbol` strings because the
//! instance entry is a single Map and key length has no per-entry ledger cost.

use soroban_sdk::{contracttype, Address, BytesN, Env, Map, Symbol, Vec};

use crate::{ClipMetadata, TokenData};

// ── Public constants ─────────────────────────────────────────────────────────

/// Maximum allowed royalty value in basis points (100 % = 10 000 BPS).
pub const ROYALTY_BPS_MAX: u32 = 10_000;

/// 24-hour timelock for emergency XLM withdrawal (Issue #676).
pub const WITHDRAW_TIMELOCK_SECS: u64 = 86_400;

// ── Persistent storage keys (contracttype enum) ──────────────────────────────
//
// Using a #[contracttype] enum encodes each variant as a compact XDR
// discriminant rather than a human-readable string. This is the Soroban-
// recommended pattern for typed, gas-efficient per-entry storage keys.

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    /// Core token data (owner, creator, clip_id, …).
    Token(u64),
    /// Tokens owned by an address.
    OwnerTokens(Address),
    /// Single-token approved spender.
    Approval(u64),
    /// Operator approved for ALL tokens of an owner.
    OperatorApproval(Address, Address),
    /// Per-token royalty BPS override.
    RoyaltyBps(u64),
    /// Per-token royalty recipient override.
    RoyaltyRecipient(u64),
    /// Per-token extended metadata (ClipMetadata).
    Metadata(u64),
    /// Flag: metadata has been updated once already.
    MetadataUpdated(u64),
    /// Custom / override token URI.
    CustomUri(u64),
    /// Per-token multi-recipient royalty split map.
    RoyaltyShares(u64),
    /// Nonce for replay-attack prevention per caller.
    Nonce(Address),
    /// Pre-verified clip hash (for mint_verified).
    VerifiedClip(BytesN<32>),
}

// ── Instance storage key strings (short, kept as Symbol) ────────────────────
// Instance storage is a single Map entry; key length has no per-entry cost.
const ADMIN_KEY:                &str = "adm";
const TOTAL_SUPPLY_KEY:         &str = "ts";
const DEFAULT_ROYALTY_BPS_KEY:  &str = "drb";
const PAUSED_KEY:               &str = "pau";
const DEFAULT_ROYALTY_ASSET_KEY:&str = "dra";
const SUPPORTED_ASSETS_KEY:     &str = "sa";
const PLATFORM_FEE_ADDR_KEY:    &str = "pfa";
const PLATFORM_FEE_BPS_KEY:     &str = "pfb";
const WASM_HASH_KEY:            &str = "wasm";
const CONTRACT_VERSION_KEY:     &str = "ver";
const WITHDRAW_UNLOCK_KEY:      &str = "wu";
const XLM_TOKEN_KEY:            &str = "xlm";

// ── Admin ────────────────────────────────────────────────────────────────────

pub fn has_admin(env: &Env) -> bool {
    env.storage().instance().has(&Symbol::new(env, ADMIN_KEY))
}

pub fn set_admin(env: &Env, admin: &Address) {
    env.storage().instance().set(&Symbol::new(env, ADMIN_KEY), admin);
}

pub fn get_admin(env: &Env) -> Option<Address> {
    env.storage().instance().get(&Symbol::new(env, ADMIN_KEY))
}

// ── Token data ───────────────────────────────────────────────────────────────

pub fn set_token(env: &Env, token_id: u64, token_data: &TokenData) {
    env.storage().persistent().set(&DataKey::Token(token_id), token_data);
}

pub fn get_token(env: &Env, token_id: u64) -> Option<TokenData> {
    env.storage().persistent().get(&DataKey::Token(token_id))
}

pub fn has_token(env: &Env, token_id: u64) -> bool {
    env.storage().persistent().has(&DataKey::Token(token_id))
}

pub fn remove_token(env: &Env, token_id: u64) {
    env.storage().persistent().remove(&DataKey::Token(token_id));
}

// ── Owner token list ─────────────────────────────────────────────────────────

pub fn set_owner_token(env: &Env, owner: &Address, token_id: u64) {
    let key = DataKey::OwnerTokens(owner.clone());
    let mut tokens: Vec<u64> = env.storage().persistent().get(&key).unwrap_or(Vec::new(env));
    if !tokens.contains(token_id) {
        tokens.push_back(token_id);
        env.storage().persistent().set(&key, &tokens);
    }
}

pub fn remove_owner_token(env: &Env, owner: &Address, token_id: u64) {
    let key = DataKey::OwnerTokens(owner.clone());
    let tokens: Vec<u64> = env.storage().persistent().get(&key).unwrap_or(Vec::new(env));
    let mut new_tokens = Vec::new(env);
    for id in tokens.iter() {
        if id != token_id {
            new_tokens.push_back(id);
        }
    }
    env.storage().persistent().set(&key, &new_tokens);
}

pub fn get_owner_tokens(env: &Env, owner: &Address) -> Vec<u64> {
    env.storage()
        .persistent()
        .get(&DataKey::OwnerTokens(owner.clone()))
        .unwrap_or(Vec::new(env))
}

// ── Total supply ─────────────────────────────────────────────────────────────

pub fn increment_total_supply(env: &Env) {
    let current = get_total_supply(env);
    env.storage()
        .instance()
        .set(&Symbol::new(env, TOTAL_SUPPLY_KEY), &(current + 1));
}

pub fn decrement_total_supply(env: &Env) {
    let current = get_total_supply(env);
    env.storage()
        .instance()
        .set(&Symbol::new(env, TOTAL_SUPPLY_KEY), &current.saturating_sub(1));
}

pub fn get_total_supply(env: &Env) -> u64 {
    env.storage()
        .instance()
        .get(&Symbol::new(env, TOTAL_SUPPLY_KEY))
        .unwrap_or(0)
}

// ── Single-token approvals ───────────────────────────────────────────────────

pub fn set_approval(env: &Env, token_id: u64, spender: &Address) {
    env.storage()
        .persistent()
        .set(&DataKey::Approval(token_id), spender);
}

pub fn get_approval(env: &Env, token_id: u64) -> Option<Address> {
    env.storage().persistent().get(&DataKey::Approval(token_id))
}

pub fn is_approved(env: &Env, token_id: u64, spender: &Address) -> bool {
    get_approval(env, token_id)
        .map(|a| a == *spender)
        .unwrap_or(false)
}

pub fn remove_approval(env: &Env, token_id: u64) {
    env.storage()
        .persistent()
        .remove(&DataKey::Approval(token_id));
}

// ── Operator approvals (Issue #675) ─────────────────────────────────────────

pub fn set_approval_for_all(env: &Env, owner: &Address, operator: &Address, approved: bool) {
    let key = DataKey::OperatorApproval(owner.clone(), operator.clone());
    if approved {
        env.storage().persistent().set(&key, &true);
    } else {
        env.storage().persistent().remove(&key);
    }
}

pub fn is_approved_for_all(env: &Env, owner: &Address, operator: &Address) -> bool {
    env.storage()
        .persistent()
        .get(&DataKey::OperatorApproval(owner.clone(), operator.clone()))
        .unwrap_or(false)
}

// ── Default royalty BPS ──────────────────────────────────────────────────────
// ── Issue #675: Operator approvals ─────────────────────────────────────────

/// Set operator approval for all tokens owned by `owner`.
/// Allows `operator` to transfer any of owner's NFTs via `transfer_from`.
pub fn set_approval_for_all(env: &Env, owner: &Address, operator: &Address, approved: bool) {
    let key = (Symbol::new(env, "op_appr"), owner.clone(), operator.clone());
    if approved {
        env.storage().persistent().set(&key, &true);
    } else {
        env.storage().persistent().remove(&key);
    }
}

/// Check whether `operator` is approved to manage all of `owner`'s NFTs.
pub fn is_approved_for_all(env: &Env, owner: &Address, operator: &Address) -> bool {
    let key = (Symbol::new(env, "op_appr"), owner.clone(), operator.clone());
    env.storage().persistent().get(&key).unwrap_or(false)
}

pub fn set_default_royalty_bps(env: &Env, bps: u32) {
    env.storage()
        .instance()
        .set(&Symbol::new(env, DEFAULT_ROYALTY_BPS_KEY), &bps);
}

pub fn get_default_royalty_bps(env: &Env) -> Option<u32> {
    env.storage()
        .instance()
        .get(&Symbol::new(env, DEFAULT_ROYALTY_BPS_KEY))
}

// ── Per-token royalty BPS ────────────────────────────────────────────────────

pub fn set_token_royalty_bps(env: &Env, token_id: u64, bps: u32) {
    env.storage()
        .persistent()
        .set(&DataKey::RoyaltyBps(token_id), &bps);
}

pub fn get_token_royalty_bps(env: &Env, token_id: u64) -> Option<u32> {
    env.storage().persistent().get(&DataKey::RoyaltyBps(token_id))
}

// ── Token metadata (ClipMetadata) ───────────────────────────────────────────

pub fn set_token_metadata(env: &Env, token_id: u64, metadata: &ClipMetadata) {
    env.storage()
        .persistent()
        .set(&DataKey::Metadata(token_id), metadata);
}

pub fn get_token_metadata(env: &Env, token_id: u64) -> Option<ClipMetadata> {
    env.storage().persistent().get(&DataKey::Metadata(token_id))
}

pub fn remove_token_metadata(env: &Env, token_id: u64) {
    env.storage()
        .persistent()
        .remove(&DataKey::Metadata(token_id));
}

// ── Metadata-updated flag ────────────────────────────────────────────────────

pub fn set_metadata_updated(env: &Env, token_id: u64) {
    env.storage()
        .persistent()
        .set(&DataKey::MetadataUpdated(token_id), &true);
}

pub fn is_metadata_updated(env: &Env, token_id: u64) -> bool {
    env.storage()
        .persistent()
        .get(&DataKey::MetadataUpdated(token_id))
        .unwrap_or(false)
}

// ── Custom token URI ─────────────────────────────────────────────────────────

pub fn set_custom_token_uri(env: &Env, token_id: u64, uri: &soroban_sdk::String) {
    env.storage()
        .persistent()
        .set(&DataKey::CustomUri(token_id), uri);
}

pub fn get_custom_token_uri(env: &Env, token_id: u64) -> Option<soroban_sdk::String> {
    env.storage().persistent().get(&DataKey::CustomUri(token_id))
}

// ── Per-token royalty recipient ──────────────────────────────────────────────

pub fn set_token_royalty_recipient(env: &Env, token_id: u64, recipient: &Address) {
    env.storage()
        .persistent()
        .set(&DataKey::RoyaltyRecipient(token_id), recipient);
}

pub fn get_token_royalty_recipient(env: &Env, token_id: u64) -> Option<Address> {
    env.storage()
        .persistent()
        .get(&DataKey::RoyaltyRecipient(token_id))
}

// ── Multi-recipient royalty shares ───────────────────────────────────────────

pub fn set_royalty_shares(env: &Env, token_id: u64, royalties: &Map<Address, u32>) {
    env.storage()
        .persistent()
        .set(&DataKey::RoyaltyShares(token_id), royalties);
}

pub fn get_royalty_shares(env: &Env, token_id: u64) -> Option<Map<Address, u32>> {
    env.storage()
        .persistent()
        .get(&DataKey::RoyaltyShares(token_id))
}

// ── Pausable ─────────────────────────────────────────────────────────────────

pub fn set_paused(env: &Env, paused: bool) {
    env.storage()
        .instance()
        .set(&Symbol::new(env, PAUSED_KEY), &paused);
}

pub fn is_paused(env: &Env) -> bool {
    env.storage()
        .instance()
        .get(&Symbol::new(env, PAUSED_KEY))
        .unwrap_or(false)
}

// ── Royalty asset allow-list ─────────────────────────────────────────────────

pub fn set_default_royalty_asset(env: &Env, asset: &Address) {
    env.storage()
        .instance()
        .set(&Symbol::new(env, DEFAULT_ROYALTY_ASSET_KEY), asset);
}

pub fn get_default_royalty_asset(env: &Env) -> Option<Address> {
    env.storage()
        .instance()
        .get(&Symbol::new(env, DEFAULT_ROYALTY_ASSET_KEY))
}

pub fn add_supported_asset(env: &Env, asset: &Address) {
    let mut assets = get_supported_assets(env);
    if !assets.contains(asset) {
        assets.push_back(asset.clone());
        env.storage()
            .instance()
            .set(&Symbol::new(env, SUPPORTED_ASSETS_KEY), &assets);
    }
}

pub fn remove_supported_asset(env: &Env, asset: &Address) {
    let assets = get_supported_assets(env);
    let mut remaining = Vec::new(env);
    for a in assets.iter() {
        if a != *asset {
            remaining.push_back(a);
        }
    }
    env.storage()
        .instance()
        .set(&Symbol::new(env, SUPPORTED_ASSETS_KEY), &remaining);
}

pub fn get_supported_assets(env: &Env) -> Vec<Address> {
    env.storage()
        .instance()
        .get(&Symbol::new(env, SUPPORTED_ASSETS_KEY))
        .unwrap_or(Vec::new(env))
}

pub fn is_supported_asset(env: &Env, asset: &Address) -> bool {
    get_supported_assets(env).contains(asset)
}

pub fn remove_token(env: &Env, token_id: u64) {
    env.storage().persistent().remove(&token_id);
}

pub fn remove_token_metadata(env: &Env, token_id: u64) {
    env.storage()
        .persistent()
        .remove(&(token_id, Symbol::new(env, "metadata")));
}

pub fn decrement_total_supply(env: &Env) {
    let current = get_total_supply(env);
    env.storage()
        .instance()
        .set(&Symbol::new(env, TOTAL_SUPPLY_KEY), &current.saturating_sub(1));
}

// ── Platform fee ─────────────────────────────────────────────────────────────

pub fn set_platform_fee(env: &Env, recipient: &Address, bps: u32) {
    env.storage()
        .instance()
        .set(&Symbol::new(env, PLATFORM_FEE_ADDR_KEY), recipient);
    env.storage()
        .instance()
        .set(&Symbol::new(env, PLATFORM_FEE_BPS_KEY), &bps);
}

pub fn get_platform_fee(env: &Env) -> Option<(Address, u32)> {
    let recipient: Option<Address> = env
        .storage()
        .instance()
        .get(&Symbol::new(env, PLATFORM_FEE_ADDR_KEY));
    let bps: Option<u32> = env
        .storage()
        .instance()
        .get(&Symbol::new(env, PLATFORM_FEE_BPS_KEY));
    recipient.zip(bps)
}

// ── Upgradeability (Issue #641) ──────────────────────────────────────────────

pub fn set_wasm_hash(env: &Env, hash: &BytesN<32>) {
    env.storage()
        .instance()
        .set(&Symbol::new(env, WASM_HASH_KEY), hash);
}

pub fn get_wasm_hash(env: &Env) -> Option<BytesN<32>> {
    env.storage()
        .persistent()
        .get(&(token_id, Symbol::new(env, "royalties")))
}

pub fn set_custom_token_uri(env: &Env, token_id: u64, uri: &soroban_sdk::String) {
        .instance()
        .get(&Symbol::new(env, WASM_HASH_KEY))
}

pub fn set_contract_version(env: &Env, version: &soroban_sdk::String) {
    env.storage()
        .instance()
        .set(&Symbol::new(env, CONTRACT_VERSION_KEY), version);
}

pub fn get_contract_version(env: &Env) -> Option<soroban_sdk::String> {
    env.storage()
        .instance()
        .get(&Symbol::new(env, CONTRACT_VERSION_KEY))
}

// ── Clip verification / nonce (Issue #643) ──────────────────────────────────

pub fn set_nonce(env: &Env, caller: &Address, nonce: u64) {
    env.storage()
        .persistent()
        .set(&DataKey::Nonce(caller.clone()), &nonce);
}

pub fn get_nonce(env: &Env, caller: &Address) -> u64 {
    env.storage()
        .persistent()
        .get(&DataKey::Nonce(caller.clone()))
        .unwrap_or(0)
}

pub fn set_verified_clip(env: &Env, clip_hash: &BytesN<32>) {
    env.storage()
        .persistent()
        .set(&DataKey::VerifiedClip(clip_hash.clone()), &true);
}

pub fn is_verified_clip(env: &Env, clip_hash: &BytesN<32>) -> bool {
    env.storage()
        .persistent()
        .get(&DataKey::VerifiedClip(clip_hash.clone()))
        .unwrap_or(false)
}

// ── Emergency withdraw timelock (Issue #676) ─────────────────────────────────

pub fn set_withdraw_unlock_time(env: &Env, unlock_time: u64) {
    env.storage()
        .instance()
        .set(&Symbol::new(env, WITHDRAW_UNLOCK_KEY), &unlock_time);
}

pub fn get_withdraw_unlock_time(env: &Env) -> Option<u64> {
    env.storage()
        .instance()
        .get(&Symbol::new(env, WITHDRAW_UNLOCK_KEY))
}

pub fn clear_withdraw_unlock_time(env: &Env) {
    env.storage()
        .instance()
        .remove(&Symbol::new(env, WITHDRAW_UNLOCK_KEY));
}

pub fn set_xlm_token_address(env: &Env, address: &Address) {
    env.storage()
        .instance()
        .set(&Symbol::new(env, XLM_TOKEN_KEY), address);
}

pub fn get_xlm_token_address(env: &Env) -> Option<Address> {
    env.storage()
        .instance()
        .get(&Symbol::new(env, XLM_TOKEN_KEY))
}

// ── Issue #676: Emergency withdraw timelock ─────────────────────────────────

/// 24 hours expressed in seconds.
pub const WITHDRAW_TIMELOCK_SECS: u64 = 86_400;

const WITHDRAW_UNLOCK_KEY: &str = "wdraw_unlock";
const XLM_TOKEN_KEY: &str = "xlm_token";

/// Persist the timestamp after which `withdraw_xlm` may execute.
pub fn set_withdraw_unlock_time(env: &Env, unlock_time: u64) {
    env.storage()
        .instance()
        .set(&Symbol::new(env, WITHDRAW_UNLOCK_KEY), &unlock_time);
}

/// Retrieve the pending unlock timestamp, or `None` when not initiated.
pub fn get_withdraw_unlock_time(env: &Env) -> Option<u64> {
    env.storage()
        .instance()
        .get(&Symbol::new(env, WITHDRAW_UNLOCK_KEY))
}

/// Clear the timelock after a successful withdrawal so it cannot be
/// re-used without a fresh `initiate_withdraw` call.
pub fn clear_withdraw_unlock_time(env: &Env) {
    env.storage()
        .instance()
        .remove(&Symbol::new(env, WITHDRAW_UNLOCK_KEY));
}

/// Persist the XLM Stellar Asset Contract (SAC) address.
pub fn set_xlm_token_address(env: &Env, address: &Address) {
    env.storage()
        .instance()
        .set(&Symbol::new(env, XLM_TOKEN_KEY), address);
}

/// Retrieve the configured XLM SAC address.
pub fn get_xlm_token_address(env: &Env) -> Option<Address> {
    env.storage()
        .instance()
        .get(&Symbol::new(env, XLM_TOKEN_KEY))
// ── Royalty accumulation and claiming ───────────────────────────────────────

/// Store accumulated royalties for a token (amount owed to creator).
pub fn add_accumulated_royalty(env: &Env, token_id: u64, amount: i128) {
    let current = get_accumulated_royalty(env, token_id);
    env.storage()
        .persistent()
        .set(&(token_id, Symbol::new(env, "accum_royal")), &(current + amount));
}

/// Get accumulated royalties for a token.
pub fn get_accumulated_royalty(env: &Env, token_id: u64) -> i128 {
    env.storage()
        .persistent()
        .get(&(token_id, Symbol::new(env, "accum_royal")))
        .unwrap_or(0)
}

/// Reset accumulated royalties after claim.
pub fn reset_accumulated_royalty(env: &Env, token_id: u64) {
    env.storage()
        .persistent()
        .set(&(token_id, Symbol::new(env, "accum_royal")), &0i128);
}
