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
