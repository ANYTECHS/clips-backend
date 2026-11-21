use soroban_sdk::{symbol_short, Address, Env, String, Symbol};

use crate::error::ContractError;
use crate::types::DataKey;
use soroban_sdk::{Env, Address, String, Symbol, symbol_short, Bytes};

const OWNER: Symbol = symbol_short!("OWNER");
const CREATOR_ROYALTY_BPS: Symbol = symbol_short!("CROYALTY");
const PLATFORM_ROYALTY_BPS: Symbol = symbol_short!("PROYALTY");

// Pause-state storage keys
const PAUSED: Symbol = symbol_short!("PAUSED");
const PAUSE_REQ_TS: Symbol = symbol_short!("PAUSEREQTS");
const PAUSE_SCHED: Symbol = symbol_short!("PAUSESCHED");
const PAUSE_REASON: Symbol = symbol_short!("PAUSERSN");

/// Store the contract owner
pub fn set_owner(env: &Env, owner: &Address) {
    env.storage().persistent().set(&OWNER, owner);
}

/// Retrieve the contract owner
pub fn get_owner(env: &Env) -> Option<Address> {
    env.storage().persistent().get(&OWNER)
}

/// Check if an owner has been set (i.e., contract is initialized)
pub fn has_owner(env: &Env) -> bool {
    env.storage().persistent().has(&OWNER)
}

/// Store creator royalty basis points
pub fn set_creator_royalty_bps(env: &Env, bps: u32) {
    env.storage()
        .persistent()
        .set(&CREATOR_ROYALTY_BPS, &bps);
}

/// Retrieve creator royalty basis points
pub fn get_creator_royalty_bps(env: &Env) -> Option<u32> {
    env.storage()
        .persistent()
        .get(&CREATOR_ROYALTY_BPS)
}

/// Store platform royalty basis points
pub fn set_platform_royalty_bps(env: &Env, bps: u32) {
    env.storage()
        .persistent()
        .set(&PLATFORM_ROYALTY_BPS, &bps);
}

/// Retrieve platform royalty basis points
pub fn get_platform_royalty_bps(env: &Env) -> Option<u32> {
    env.storage()
        .persistent()
        .get(&PLATFORM_ROYALTY_BPS)
}

// ---------------------------------------------------------------------------
// Schema 2: tokens, supply, ownership index and royalties
// ---------------------------------------------------------------------------

/// Schema version written by the current code.
pub const CURRENT_SCHEMA_VERSION: u32 = 2;

/// Largest page `get_user_tokens` returns, whatever `limit` asks for.
pub const MAX_PAGE_SIZE: u32 = 100;

const TTL_THRESHOLD: u32 = 518_400; // about 30 days of ledgers
const TTL_EXTEND_TO: u32 = 3_110_400; // about 180 days of ledgers

fn bump_instance(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
}

fn set_persistent<V: soroban_sdk::IntoVal<Env, soroban_sdk::Val>>(
    env: &Env,
    key: &DataKey,
    value: &V,
) {
    env.storage().persistent().set(key, value);
    env.storage()
        .persistent()
        .extend_ttl(key, TTL_THRESHOLD, TTL_EXTEND_TO);
}

/// Schema version of the stored layout. Contracts deployed before the version
/// was recorded are schema 1.
pub fn schema_version(env: &Env) -> u32 {
    env.storage()
        .instance()
        .get(&DataKey::SchemaVersion)
        .unwrap_or(1)
}

pub fn set_schema_version(env: &Env, version: u32) {
    env.storage()
        .instance()
        .set(&DataKey::SchemaVersion, &version);
    bump_instance(env);
}

/// Write the schema-2 counters if they do not exist yet. Idempotent, so both
/// `initialize` and `migrate` can use it.
pub fn init_counters(env: &Env) {
    let instance = env.storage().instance();
    if !instance.has(&DataKey::NextTokenId) {
        instance.set(&DataKey::NextTokenId, &1u32);
    }
    if !instance.has(&DataKey::TotalSupply) {
        instance.set(&DataKey::TotalSupply, &0u32);
    }
    bump_instance(env);
}

/// Hand out the next token ID (1, 2, 3, ...). IDs are never reused after a burn.
pub fn next_token_id(env: &Env) -> Result<u32, ContractError> {
    let id: u32 = env
        .storage()
        .instance()
        .get(&DataKey::NextTokenId)
        .unwrap_or(1);
    let next = id.checked_add(1).ok_or(ContractError::Overflow)?;
    env.storage().instance().set(&DataKey::NextTokenId, &next);
    bump_instance(env);
    Ok(id)
}

/// Tokens currently in existence (minted minus burned).
pub fn total_supply(env: &Env) -> u32 {
    env.storage()
        .instance()
        .get(&DataKey::TotalSupply)
        .unwrap_or(0)
}

pub fn increment_supply(env: &Env) -> Result<(), ContractError> {
    let next = total_supply(env)
        .checked_add(1)
        .ok_or(ContractError::Overflow)?;
    env.storage().instance().set(&DataKey::TotalSupply, &next);
    bump_instance(env);
    Ok(())
}

pub fn decrement_supply(env: &Env) -> Result<(), ContractError> {
    let next = total_supply(env)
        .checked_sub(1)
        .ok_or(ContractError::Overflow)?;
    env.storage().instance().set(&DataKey::TotalSupply, &next);
    bump_instance(env);
    Ok(())
}

pub fn get_royalty_asset(env: &Env) -> Option<Address> {
    env.storage().instance().get(&DataKey::RoyaltyAsset)
}

pub fn set_royalty_asset(env: &Env, asset: &Address) {
    env.storage().instance().set(&DataKey::RoyaltyAsset, asset);
    bump_instance(env);
}

pub fn get_token_owner(env: &Env, token_id: u32) -> Option<Address> {
    env.storage().persistent().get(&DataKey::TokenOwner(token_id))
}

pub fn set_token_owner(env: &Env, token_id: u32, owner: &Address) {
    set_persistent(env, &DataKey::TokenOwner(token_id), owner);
}

pub fn set_token_creator(env: &Env, token_id: u32, creator: &Address) {
    set_persistent(env, &DataKey::TokenCreator(token_id), creator);
}

pub fn set_token_uri(env: &Env, token_id: u32, uri: &String) {
    set_persistent(env, &DataKey::TokenUri(token_id), uri);
}

pub fn get_token_uri(env: &Env, token_id: u32) -> Option<String> {
    env.storage().persistent().get(&DataKey::TokenUri(token_id))
}

/// Remove the per-token state that burning deletes. The royalty recipient and
/// balance stay, so royalties accrued before the burn can still be claimed.
pub fn remove_token(env: &Env, token_id: u32) {
    let persistent = env.storage().persistent();
    persistent.remove(&DataKey::TokenOwner(token_id));
    persistent.remove(&DataKey::TokenUri(token_id));
}

pub fn get_royalty_recipient(env: &Env, token_id: u32) -> Option<Address> {
    env.storage()
        .persistent()
        .get(&DataKey::RoyaltyRecipient(token_id))
}

pub fn set_royalty_recipient(env: &Env, token_id: u32, recipient: &Address) {
    set_persistent(env, &DataKey::RoyaltyRecipient(token_id), recipient);
}

pub fn get_royalty_balance(env: &Env, token_id: u32) -> i128 {
    env.storage()
        .persistent()
        .get(&DataKey::RoyaltyBalance(token_id))
        .unwrap_or(0)
}

pub fn set_royalty_balance(env: &Env, token_id: u32, balance: i128) {
    if balance == 0 {
        env.storage()
            .persistent()
            .remove(&DataKey::RoyaltyBalance(token_id));
    } else {
        set_persistent(env, &DataKey::RoyaltyBalance(token_id), &balance);
    }
}

/// Number of tokens `owner` holds.
pub fn owned_count(env: &Env, owner: &Address) -> u32 {
    env.storage()
        .persistent()
        .get(&DataKey::OwnedCount(owner.clone()))
        .unwrap_or(0)
}

/// Token at position `index` of the owner's list.
pub fn owned_at(env: &Env, owner: &Address, index: u32) -> Option<u32> {
    env.storage()
        .persistent()
        .get(&DataKey::OwnedAt(owner.clone(), index))
}

/// Append a token to the owner's list: three writes, whatever the list size.
pub fn add_owned(env: &Env, owner: &Address, token_id: u32) -> Result<(), ContractError> {
    let count = owned_count(env, owner);
    let new_count = count.checked_add(1).ok_or(ContractError::Overflow)?;
    set_persistent(env, &DataKey::OwnedAt(owner.clone(), count), &token_id);
    set_persistent(env, &DataKey::OwnedIndex(token_id), &count);
    set_persistent(env, &DataKey::OwnedCount(owner.clone()), &new_count);
    Ok(())
}

/// Remove a token from the owner's list by moving the last entry into its
/// slot (swap-remove), so removal is O(1) and the list stays dense. This
/// reorders the list, which is why `get_user_tokens` cursors are offsets that
/// are only stable while the owner's holdings do not change.
pub fn remove_owned(env: &Env, owner: &Address, token_id: u32) -> Result<(), ContractError> {
    let persistent = env.storage().persistent();
    let count = owned_count(env, owner);
    let last = count.checked_sub(1).ok_or(ContractError::NotFound)?;
    let index: u32 = persistent
        .get(&DataKey::OwnedIndex(token_id))
        .ok_or(ContractError::NotFound)?;

    if index != last {
        let moved: u32 = persistent
            .get(&DataKey::OwnedAt(owner.clone(), last))
            .ok_or(ContractError::NotFound)?;
        set_persistent(env, &DataKey::OwnedAt(owner.clone(), index), &moved);
        set_persistent(env, &DataKey::OwnedIndex(moved), &index);
    }
    persistent.remove(&DataKey::OwnedAt(owner.clone(), last));
    persistent.remove(&DataKey::OwnedIndex(token_id));
    if last == 0 {
        persistent.remove(&DataKey::OwnedCount(owner.clone()));
    } else {
        set_persistent(env, &DataKey::OwnedCount(owner.clone()), &last);
    }
    Ok(())
// Pause state helpers
// ---------------------------------------------------------------------------

/// Returns true when the contract is currently paused.
pub fn is_paused(env: &Env) -> bool {
    env.storage().persistent().get::<Symbol, bool>(&PAUSED).unwrap_or(false)
}

/// Set or clear the paused flag.
pub fn set_paused(env: &Env, paused: bool) {
    if paused {
        env.storage().persistent().set(&PAUSED, &true);
    } else {
        env.storage().persistent().remove(&PAUSED);
    }
}

/// Store the wall-clock timestamp (Unix seconds, u64) when the pause was requested.
pub fn set_pause_requested_ts(env: &Env, ts: u64) {
    env.storage().persistent().set(&PAUSE_REQ_TS, &ts);
}

/// Retrieve the timestamp when the pause was requested (None if unset).
pub fn get_pause_requested_ts(env: &Env) -> Option<u64> {
    env.storage().persistent().get(&PAUSE_REQ_TS)
}

/// Remove the pause-request timestamp (called on cancel or unpause).
pub fn clear_pause_requested_ts(env: &Env) {
    env.storage().persistent().remove(&PAUSE_REQ_TS);
}

/// Store the scheduled activation timestamp (requestedAt + 24 h, Unix seconds).
pub fn set_pause_scheduled_ts(env: &Env, ts: u64) {
    env.storage().persistent().set(&PAUSE_SCHED, &ts);
}

/// Retrieve the scheduled activation timestamp (None if unset).
pub fn get_pause_scheduled_ts(env: &Env) -> Option<u64> {
    env.storage().persistent().get(&PAUSE_SCHED)
}

/// Remove the scheduled activation timestamp.
pub fn clear_pause_scheduled_ts(env: &Env) {
    env.storage().persistent().remove(&PAUSE_SCHED);
}

/// Store a human-readable pause reason.
pub fn set_pause_reason(env: &Env, reason: &String) {
    env.storage().persistent().set(&PAUSE_REASON, reason);
}

/// Retrieve the pause reason (empty String if unset).
pub fn get_pause_reason(env: &Env) -> String {
    env.storage()
        .persistent()
        .get::<Symbol, String>(&PAUSE_REASON)
        .unwrap_or_else(|| String::from_str(env, ""))
}

/// Remove the stored pause reason.
pub fn clear_pause_reason(env: &Env) {
    env.storage().persistent().remove(&PAUSE_REASON);
}

// ---------------------------------------------------------------------------
// Per-collection storage helpers
//
// Collections are identified by an arbitrary String slug (e.g. "viral-clips").
// We build a composite key from a fixed prefix + the slug bytes so that
// different collections never collide and the key type stays `Bytes`.
// ---------------------------------------------------------------------------

/// Build the persistent-storage key used for a collection's minted-supply counter.
///
/// Key format: b"CS_" ++ slug_bytes  (CS = Collection Supply)
fn collection_supply_key(env: &Env, collection_id: &String) -> Bytes {
    let prefix: Bytes = Bytes::from_slice(env, b"CS_");
    let slug: Bytes = collection_id.to_bytes(env.clone());
    let mut key = prefix;
    key.append(&slug);
    key
}

/// Build the persistent-storage key used for a collection's metadata String.
///
/// Key format: b"CM_" ++ slug_bytes  (CM = Collection Metadata)
fn collection_meta_key(env: &Env, collection_id: &String) -> Bytes {
    let prefix: Bytes = Bytes::from_slice(env, b"CM_");
    let slug: Bytes = collection_id.to_bytes(env.clone());
    let mut key = prefix;
    key.append(&slug);
    key
}

/// Build the persistent-storage key used to mark that a collection has been registered.
///
/// Key format: b"CR_" ++ slug_bytes  (CR = Collection Registered)
fn collection_registered_key(env: &Env, collection_id: &String) -> Bytes {
    let prefix: Bytes = Bytes::from_slice(env, b"CR_");
    let slug: Bytes = collection_id.to_bytes(env.clone());
    let mut key = prefix;
    key.append(&slug);
    key
}

// -- Registration -----------------------------------------------------------

/// Mark a collection slug as registered.
pub fn register_collection(env: &Env, collection_id: &String) {
    let key = collection_registered_key(env, collection_id);
    env.storage().persistent().set(&key, &true);
}

/// Returns true when the collection has been registered via `register_collection`.
pub fn collection_exists(env: &Env, collection_id: &String) -> bool {
    let key = collection_registered_key(env, collection_id);
    env.storage().persistent().get::<Bytes, bool>(&key).unwrap_or(false)
}

// -- Supply counter ---------------------------------------------------------

/// Return the current minted supply for a collection (0 when never set).
pub fn get_collection_supply(env: &Env, collection_id: &String) -> u64 {
    let key = collection_supply_key(env, collection_id);
    env.storage().persistent().get::<Bytes, u64>(&key).unwrap_or(0)
}

/// Increment the minted supply for a collection by 1.
/// Returns the new supply value.
pub fn increment_collection_supply(env: &Env, collection_id: &String) -> u64 {
    let key = collection_supply_key(env, collection_id);
    let current = env.storage().persistent().get::<Bytes, u64>(&key).unwrap_or(0);
    let next = current + 1;
    env.storage().persistent().set(&key, &next);
    next
}

/// Decrement the minted supply for a collection by 1 (floor 0, used on burn).
/// Returns the new supply value.
pub fn decrement_collection_supply(env: &Env, collection_id: &String) -> u64 {
    let key = collection_supply_key(env, collection_id);
    let current = env.storage().persistent().get::<Bytes, u64>(&key).unwrap_or(0);
    let next = if current > 0 { current - 1 } else { 0 };
    env.storage().persistent().set(&key, &next);
    next
}

// -- Collection metadata ----------------------------------------------------

/// Store a free-form metadata string (e.g. JSON) for a collection.
pub fn set_collection_metadata(env: &Env, collection_id: &String, metadata: &String) {
    let key = collection_meta_key(env, collection_id);
    env.storage().persistent().set(&key, metadata);
}

/// Retrieve the metadata string for a collection (empty String if unset).
pub fn get_collection_metadata(env: &Env, collection_id: &String) -> String {
    let key = collection_meta_key(env, collection_id);
    env.storage()
        .persistent()
        .get::<Bytes, String>(&key)
        .unwrap_or_else(|| String::from_str(env, ""))
}
