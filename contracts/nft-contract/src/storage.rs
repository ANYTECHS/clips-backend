use soroban_sdk::{Address, BytesN, Env, Map, Vec};
use soroban_sdk::contracttype;
use soroban_sdk::Symbol;

use crate::TokenData;

#[contracttype]
pub struct TokenStorage;

// ── Compact storage keys (issue #642) ──────────────────────────────────────
// Short keys reduce per-entry storage footprint and RPC read latency.
const TOTAL_SUPPLY_KEY: &str = "ts";
const ADMIN_KEY: &str = "adm";
const DEFAULT_ROYALTY_BPS_KEY: &str = "drb";

/// Maximum allowed royalty value in basis points (100% = 10 000 BPS).
pub const ROYALTY_BPS_MAX: u32 = 10_000;

pub fn has_admin(env: &Env) -> bool {
    env.storage().instance().has(&Symbol::new(env, ADMIN_KEY))
}

pub fn set_admin(env: &Env, admin: &Address) {
    env.storage().instance().set(&Symbol::new(env, ADMIN_KEY), admin);
}

pub fn get_admin(env: &Env) -> Option<Address> {
    env.storage().instance().get(&Symbol::new(env, ADMIN_KEY))
}

pub fn set_token(env: &Env, token_id: u64, token_data: &TokenData) {
    env.storage().persistent().set(&token_id, token_data);
}

pub fn get_token(env: &Env, token_id: u64) -> Option<TokenData> {
    env.storage().persistent().get(&token_id)
}

pub fn has_token(env: &Env, token_id: u64) -> bool {
    env.storage().persistent().has(&token_id)
}

pub fn set_owner_token(env: &Env, owner: &Address, token_id: u64) {
    let mut tokens: Vec<u64> = env.storage().persistent().get(&owner).unwrap_or(Vec::new(env));
    if !tokens.contains(token_id) {
        tokens.push_back(token_id);
        env.storage().persistent().set(&owner, &tokens);
    }
}

pub fn remove_owner_token(env: &Env, owner: &Address, token_id: u64) {
    let tokens: Vec<u64> = env.storage().persistent().get(&owner).unwrap_or(Vec::new(env));
    let mut new_tokens = Vec::new(env);
    for id in tokens.iter() {
        if id != token_id {
            new_tokens.push_back(id);
        }
    }
    env.storage().persistent().set(&owner, &new_tokens);
}

pub fn get_owner_tokens(env: &Env, owner: &Address) -> Vec<u64> {
    env.storage().persistent().get(&owner).unwrap_or(Vec::new(env))
}

pub fn increment_total_supply(env: &Env) {
    let current = get_total_supply(env);
    env.storage().instance().set(&Symbol::new(env, TOTAL_SUPPLY_KEY), &(current + 1));
}

pub fn get_total_supply(env: &Env) -> u64 {
    env.storage().instance().get(&Symbol::new(env, TOTAL_SUPPLY_KEY)).unwrap_or(0)
}

pub fn set_approval(env: &Env, token_id: u64, spender: &Address) {
    env.storage().persistent().set(&(token_id, Symbol::new(env, "approval")), spender);
}

pub fn get_approval(env: &Env, token_id: u64) -> Option<Address> {
    env.storage().persistent().get(&(token_id, Symbol::new(env, "approval")))
}

pub fn is_approved(env: &Env, token_id: u64, spender: &Address) -> bool {
    get_approval(env, token_id).map(|a| a == *spender).unwrap_or(false)
}

pub fn remove_approval(env: &Env, token_id: u64) {
    env.storage().persistent().remove(&(token_id, Symbol::new(env, "approval")));
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

/// Store a per-token royalty override in basis points.
/// This takes precedence over the contract-level default in `transfer_with_royalty`.
pub fn set_token_royalty_bps(env: &Env, token_id: u64, bps: u32) {
    env.storage()
        .persistent()
        .set(&(token_id, Symbol::new(env, "royalty_bps")), &bps);
}

/// Retrieve the per-token royalty BPS override, or `None` when not set.
pub fn get_token_royalty_bps(env: &Env, token_id: u64) -> Option<u32> {
    env.storage()
        .persistent()
        .get(&(token_id, Symbol::new(env, "royalty_bps")))
}

pub fn set_token_metadata(env: &Env, token_id: u64, metadata: &crate::ClipMetadata) {
    env.storage().persistent().set(&(token_id, Symbol::new(env, "metadata")), metadata);
}

pub fn get_token_metadata(env: &Env, token_id: u64) -> Option<crate::ClipMetadata> {
    env.storage().persistent().get(&(token_id, Symbol::new(env, "metadata")))
}

// ── Issue #641: upgradeability ──────────────────────────────────────────────

pub fn set_wasm_hash(env: &Env, hash: &BytesN<32>) {
    env.storage()
        .instance()
        .set(&Symbol::new(env, "wasm"), hash);
}

pub fn get_wasm_hash(env: &Env) -> Option<BytesN<32>> {
    env.storage().instance().get(&Symbol::new(env, "wasm"))
}

pub fn set_contract_version(env: &Env, version: &soroban_sdk::String) {
    env.storage()
        .instance()
        .set(&Symbol::new(env, "ver"), version);
}

pub fn get_contract_version(env: &Env) -> Option<soroban_sdk::String> {
    env.storage().instance().get(&Symbol::new(env, "ver"))
}

// ── Issue #643: clip verification / nonce ───────────────────────────────────

pub fn set_nonce(env: &Env, caller: &Address, nonce: u64) {
    env.storage()
        .persistent()
        .set(&(Symbol::new(env, "nonce"), caller.clone()), &nonce);
}

pub fn get_nonce(env: &Env, caller: &Address) -> u64 {
    env.storage()
        .persistent()
        .get(&(Symbol::new(env, "nonce"), caller.clone()))
        .unwrap_or(0)
}

pub fn set_verified_clip(env: &Env, clip_hash: &BytesN<32>) {
    env.storage()
        .persistent()
        .set(&(Symbol::new(env, "vclip"), clip_hash.clone()), &true);
}

pub fn is_verified_clip(env: &Env, clip_hash: &BytesN<32>) -> bool {
    env.storage()
        .persistent()
        .get(&(Symbol::new(env, "vclip"), clip_hash.clone()))
        .unwrap_or(false)
}
