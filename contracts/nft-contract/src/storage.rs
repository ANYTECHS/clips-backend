use soroban_sdk::{Address, Env, Map, Vec};
use soroban_sdk::contracttype;
use soroban_sdk::Symbol;

use crate::TokenData;

#[contracttype]
pub struct TokenStorage;

const TOTAL_SUPPLY_KEY: &str = "total_supply";
const ADMIN_KEY: &str = "admin";
const DEFAULT_ROYALTY_BPS_KEY: &str = "def_royalty_bps";
const PAUSED_KEY: &str = "paused";
const DEFAULT_ROYALTY_ASSET_KEY: &str = "def_royalty_asset";
const SUPPORTED_ASSETS_KEY: &str = "supported_assets";

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

pub fn set_token_metadata(env: &Env, token_id: u64, metadata: &crate::ClipMetadata) {
    env.storage().persistent().set(&(token_id, Symbol::new(env, "metadata")), metadata);
}

pub fn get_token_metadata(env: &Env, token_id: u64) -> Option<crate::ClipMetadata> {
    env.storage().persistent().get(&(token_id, Symbol::new(env, "metadata")))
}

// ── Pausable ─────────────────────────────────────────────────────────────

pub fn set_paused(env: &Env, paused: bool) {
    env.storage().instance().set(&Symbol::new(env, PAUSED_KEY), &paused);
}

pub fn is_paused(env: &Env) -> bool {
    env.storage()
        .instance()
        .get(&Symbol::new(env, PAUSED_KEY))
        .unwrap_or(false)
}

// ── Royalty asset configuration ─────────────────────────────────────────

/// The Stellar asset contract (SAC) address royalties are paid in.
/// Defaults to the native XLM SAC when unset.
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

/// Admin-maintained allow-list of asset contract addresses that may be used
/// for royalty payouts (e.g. the native XLM SAC and USDC's SAC).
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
