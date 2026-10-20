use soroban_sdk::{Env, Address, Symbol, symbol_short};

const OWNER: Symbol = symbol_short!("OWNER");
const CREATOR_ROYALTY_BPS: Symbol = symbol_short!("CROYALTY");
const PLATFORM_ROYALTY_BPS: Symbol = symbol_short!("PROYALTY");

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
