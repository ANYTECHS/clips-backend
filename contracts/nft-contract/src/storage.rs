use soroban_sdk::{Address, BytesN, Env, String, Vec};
use soroban_sdk::contracttype;
use soroban_sdk::Symbol;

use crate::TokenData;

#[contracttype]
pub struct TokenStorage;

const TOTAL_SUPPLY_KEY: &str = "total_supply";
const ADMIN_KEY: &str = "admin";
const DEFAULT_ROYALTY_BPS_KEY: &str = "def_royalty_bps";

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

const MINT_SIGNER_KEY: &str = "mint_signer";
const MINT_COOLDOWN_KEY: &str = "mint_cooldown";

pub fn set_mint_signer(env: &Env, key: &BytesN<32>) {
    env.storage().instance().set(&Symbol::new(env, MINT_SIGNER_KEY), key);
}

pub fn get_mint_signer(env: &Env) -> Option<BytesN<32>> {
    env.storage().instance().get(&Symbol::new(env, MINT_SIGNER_KEY))
}

pub fn is_nonce_used(env: &Env, nonce: u64) -> bool {
    env.storage().persistent().has(&(Symbol::new(env, "nonce"), nonce))
}

pub fn set_nonce_used(env: &Env, nonce: u64) {
    env.storage().persistent().set(&(Symbol::new(env, "nonce"), nonce), &true);
}

pub fn is_clip_minted(env: &Env, clip_id: &String) -> bool {
    env.storage().persistent().has(&(Symbol::new(env, "clip"), clip_id.clone()))
}

pub fn set_clip_minted(env: &Env, clip_id: &String) {
    env.storage().persistent().set(&(Symbol::new(env, "clip"), clip_id.clone()), &true);
}

pub fn set_mint_cooldown(env: &Env, seconds: u64) {
    env.storage().instance().set(&Symbol::new(env, MINT_COOLDOWN_KEY), &seconds);
}

pub fn get_mint_cooldown(env: &Env) -> u64 {
    env.storage().instance().get(&Symbol::new(env, MINT_COOLDOWN_KEY)).unwrap_or(0)
}

pub fn set_last_mint(env: &Env, wallet: &Address, ts: u64) {
    env.storage().persistent().set(&(Symbol::new(env, "last_mint"), wallet.clone()), &ts);
}

pub fn get_last_mint(env: &Env, wallet: &Address) -> Option<u64> {
    env.storage().persistent().get(&(Symbol::new(env, "last_mint"), wallet.clone()))
}

fn operators_key(env: &Env, owner: &Address) -> (Symbol, Address) {
    (Symbol::new(env, "operators"), owner.clone())
}

pub fn get_operators(env: &Env, owner: &Address) -> Vec<Address> {
    env.storage().persistent().get(&operators_key(env, owner)).unwrap_or(Vec::new(env))
}

pub fn is_operator(env: &Env, owner: &Address, operator: &Address) -> bool {
    get_operators(env, owner).contains(operator)
}

pub fn add_operator(env: &Env, owner: &Address, operator: &Address) {
    let mut ops = get_operators(env, owner);
    if !ops.contains(operator) {
        ops.push_back(operator.clone());
        env.storage().persistent().set(&operators_key(env, owner), &ops);
    }
}

pub fn remove_operator(env: &Env, owner: &Address, operator: &Address) {
    let mut ops = get_operators(env, owner);
    if let Some(i) = ops.first_index_of(operator) {
        ops.remove(i);
        env.storage().persistent().set(&operators_key(env, owner), &ops);
    }
}

pub fn clear_operators(env: &Env, owner: &Address) {
    env.storage().persistent().remove(&operators_key(env, owner));
}
