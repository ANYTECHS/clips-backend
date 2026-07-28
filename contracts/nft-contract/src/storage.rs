use soroban_sdk::{Address, Env, Vec};
use soroban_sdk::contracttype;
use soroban_sdk::String;
use soroban_sdk::Symbol;

use crate::TokenData;
use crate::ClipMetadata;

#[contracttype]
pub struct TokenStorage;

const TOTAL_SUPPLY_KEY: &str = "total_supply";
const ADMIN_KEY: &str = "admin";
const OWNER_KEY: &str = "owner";
const DEFAULT_ROYALTY_BPS_KEY: &str = "def_royalty_bps";

/// Maximum allowed royalty value in basis points for ClipCash NFTs (15% = 1500 BPS).
/// Values above this threshold are rejected by the contract.
pub const ROYALTY_BPS_MAX: u32 = 1_500;

// ── Admin / Owner ────────────────────────────────────────────────────────────

pub fn has_admin(env: &Env) -> bool {
    env.storage().instance().has(&Symbol::new(env, ADMIN_KEY))
}

pub fn set_admin(env: &Env, admin: &Address) {
    env.storage().instance().set(&Symbol::new(env, ADMIN_KEY), admin);
}

pub fn get_admin(env: &Env) -> Option<Address> {
    env.storage().instance().get(&Symbol::new(env, ADMIN_KEY))
}

/// Store the contract owner separately from the admin (same address at init,
/// but exposed via the `get_owner` public function for frontend integration).
pub fn set_owner(env: &Env, owner: &Address) {
    env.storage().instance().set(&Symbol::new(env, OWNER_KEY), owner);
}

pub fn get_owner(env: &Env) -> Option<Address> {
    env.storage().instance().get(&Symbol::new(env, OWNER_KEY))
}

// ── Token data ───────────────────────────────────────────────────────────────

pub fn set_token(env: &Env, token_id: u64, token_data: &TokenData) {
    env.storage().persistent().set(&token_id, token_data);
}

pub fn get_token(env: &Env, token_id: u64) -> Option<TokenData> {
    env.storage().persistent().get(&token_id)
}

pub fn has_token(env: &Env, token_id: u64) -> bool {
    env.storage().persistent().has(&token_id)
}

// ── Clip-ID index (duplicate prevention) ────────────────────────────────────

/// Return `true` when a token has already been minted for the given clip_id.
pub fn has_clip_id(env: &Env, clip_id: &String) -> bool {
    let key = (Symbol::new(env, "clip"), clip_id.clone());
    env.storage().persistent().has(&key)
}

/// Record that `clip_id` has been minted as `token_id` so we can detect duplicates.
pub fn set_clip_id_token(env: &Env, clip_id: &String, token_id: u64) {
    let key = (Symbol::new(env, "clip"), clip_id.clone());
    env.storage().persistent().set(&key, &token_id);
}

/// Look up the token_id previously minted for a clip_id (if any).
pub fn get_clip_id_token(env: &Env, clip_id: &String) -> Option<u64> {
    let key = (Symbol::new(env, "clip"), clip_id.clone());
    env.storage().persistent().get(&key)
}

// ── Ownership index ──────────────────────────────────────────────────────────

pub fn set_owner_token(env: &Env, owner: &Address, token_id: u64) {
    let mut tokens: Vec<u64> = env.storage().persistent().get(owner).unwrap_or(Vec::new(env));
    if !tokens.contains(token_id) {
        tokens.push_back(token_id);
        env.storage().persistent().set(owner, &tokens);
    }
}

pub fn remove_owner_token(env: &Env, owner: &Address, token_id: u64) {
    let tokens: Vec<u64> = env.storage().persistent().get(owner).unwrap_or(Vec::new(env));
    let mut new_tokens = Vec::new(env);
    for id in tokens.iter() {
        if id != token_id {
            new_tokens.push_back(id);
        }
    }
    env.storage().persistent().set(owner, &new_tokens);
}

pub fn get_owner_tokens(env: &Env, owner: &Address) -> Vec<u64> {
    env.storage().persistent().get(owner).unwrap_or(Vec::new(env))
}

// ── Supply ───────────────────────────────────────────────────────────────────

pub fn increment_total_supply(env: &Env) {
    let current = get_total_supply(env);
    env.storage().instance().set(&Symbol::new(env, TOTAL_SUPPLY_KEY), &(current + 1));
}

pub fn get_total_supply(env: &Env) -> u64 {
    env.storage().instance().get(&Symbol::new(env, TOTAL_SUPPLY_KEY)).unwrap_or(0)
}

// ── Approvals ────────────────────────────────────────────────────────────────

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

// ── Default royalty ──────────────────────────────────────────────────────────

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

// ── Token metadata ───────────────────────────────────────────────────────────

pub fn set_token_metadata(env: &Env, token_id: u64, metadata: &ClipMetadata) {
    env.storage()
        .persistent()
        .set(&(token_id, Symbol::new(env, "metadata")), metadata);
}

pub fn get_token_metadata(env: &Env, token_id: u64) -> Option<ClipMetadata> {
    env.storage()
        .persistent()
        .get(&(token_id, Symbol::new(env, "metadata")))
}
