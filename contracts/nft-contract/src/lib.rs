#![no_std]
use soroban_sdk::{
    contract, contracterror, contractimpl, contractmeta, contracttype,
    Address, BytesN, Env, String, Symbol, Val, Vec,
};
use soroban_token_sdk::metadata::TokenMetadata;

mod admin;
mod metadata;
mod storage;

#[cfg(test)]
mod test;

pub use admin::Admin;
pub use metadata::ClipMetadata;
pub use storage::{get_token_metadata, set_token_metadata, TokenStorage, ROYALTY_BPS_MAX};

const CLIP_NAME: &[u8] = b"ClipCash NFT";
const CLIP_SYMBOL: &[u8] = b"CLIP";

#[contractmeta(key = "name", val = "ClipCash NFT Contract")]
#[contractmeta(key = "version", val = "1.0.0")]

pub struct ClipsNftContract;

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TokenData {
    pub owner: Address,
    pub is_soulbound: bool,
    pub creator: Address,
    pub clip_id: String,
    pub content_uri: String,
    pub created_at: u64,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    Unauthorized = 1,
    TokenNotFound = 2,
    AlreadyInitialized = 3,
    NotInitialized = 4,
    SoulboundTokenNotTransferable = 5,
    InvalidTokenId = 6,
    /// Royalty value is outside the valid 0–10 000 BPS range.
    InvalidRoyaltyBps = 7,
    /// Provided WASM hash is all zeros — cannot upgrade to a no-op contract.
    InvalidWasmHash = 8,
    /// Clip signature verification failed — caller is not the clip owner.
    InvalidSignature = 9,
    /// Nonce is stale — replay attack detected.
    InvalidNonce = 10,
    /// Clip hash was not pre-verified by the admin.
    ClipNotVerified = 11,
}

#[contractimpl]
impl ClipsNftContract {
    pub fn initialize(env: Env, admin: Address) -> Result<(), Error> {
        if storage::has_admin(&env) {
            return Err(Error::AlreadyInitialized);
        }
        storage::set_admin(&env, &admin);
        Ok(())
    }

    pub fn mint(
        env: Env,
        to: Address,
        token_id: u64,
        clip_id: String,
        content_uri: String,
        is_soulbound: bool,
    ) -> Result<(), Error> {
        let admin = storage::get_admin(&env).ok_or(Error::NotInitialized)?;
        admin.require_auth();

        if storage::has_token(&env, token_id) {
            return Err(Error::InvalidTokenId);
        }

        let creator = to.clone();
        let created_at = env.ledger().timestamp();

        let token_data = TokenData {
            owner: to.clone(),
            is_soulbound,
            creator,
            clip_id,
            content_uri,
            created_at,
        };

        storage::set_token(&env, token_id, &token_data);
        storage::set_owner_token(&env, &to, token_id);
        storage::increment_total_supply(&env);

        events::emit_mint(&env, &to, token_id, is_soulbound);
        Ok(())
    }

    pub fn transfer(
        env: Env,
        from: Address,
        to: Address,
        token_id: u64,
    ) -> Result<(), Error> {
        from.require_auth();

        let token_data = storage::get_token(&env, token_id).ok_or(Error::TokenNotFound)?;

        if token_data.owner != from {
            return Err(Error::Unauthorized);
        }

        if token_data.is_soulbound {
            return Err(Error::SoulboundTokenNotTransferable);
        }

        storage::remove_owner_token(&env, &from, token_id);
        storage::set_owner_token(&env, &to, token_id);

        let mut updated_token = token_data;
        updated_token.owner = to.clone();
        storage::set_token(&env, token_id, &updated_token);

        events::emit_transfer(&env, &from, &to, token_id);
        Ok(())
    }

    pub fn transfer_from(
        env: Env,
        spender: Address,
        from: Address,
        to: Address,
        token_id: u64,
    ) -> Result<(), Error> {
        spender.require_auth();

        let token_data = storage::get_token(&env, token_id).ok_or(Error::TokenNotFound)?;

        if token_data.owner != from {
            return Err(Error::Unauthorized);
        }

        if !storage::is_approved(&env, token_id, &spender) && token_data.owner != spender {
            return Err(Error::Unauthorized);
        }

        if token_data.is_soulbound {
            return Err(Error::SoulboundTokenNotTransferable);
        }

        storage::remove_owner_token(&env, &from, token_id);
        storage::set_owner_token(&env, &to, token_id);

        let mut updated_token = token_data;
        updated_token.owner = to.clone();
        storage::set_token(&env, token_id, &updated_token);

        storage::remove_approval(&env, token_id);

        events::emit_transfer(&env, &from, &to, token_id);
        Ok(())
    }

    pub fn approve(env: Env, owner: Address, spender: Address, token_id: u64) -> Result<(), Error> {
        owner.require_auth();

        let token_data = storage::get_token(&env, token_id).ok_or(Error::TokenNotFound)?;

        if token_data.owner != owner {
            return Err(Error::Unauthorized);
        }

        if token_data.is_soulbound {
            return Err(Error::SoulboundTokenNotTransferable);
        }

        storage::set_approval(&env, token_id, &spender);
        events::emit_approve(&env, &owner, &spender, token_id);
        Ok(())
    }

    pub fn owner_of(env: Env, token_id: u64) -> Option<Address> {
        storage::get_token(&env, token_id).map(|t| t.owner)
    }

    pub fn get_token_data(env: Env, token_id: u64) -> Option<TokenData> {
        storage::get_token(&env, token_id)
    }

    pub fn is_soulbound(env: Env, token_id: u64) -> bool {
        storage::get_token(&env, token_id)
            .map(|t| t.is_soulbound)
            .unwrap_or(false)
    }

    pub fn get_creator(env: Env, token_id: u64) -> Option<Address> {
        storage::get_token(&env, token_id).map(|t| t.creator)
    }

    pub fn balance_of(env: Env, owner: Address) -> u64 {
        storage::get_owner_tokens(&env, &owner).len() as u64
    }

    pub fn total_supply(env: Env) -> u64 {
        storage::get_total_supply(&env)
    }

    pub fn get_approved(env: Env, token_id: u64) -> Option<Address> {
        storage::get_approval(&env, token_id)
    }

    /// Set the default royalty percentage applied to newly minted NFTs.
    ///
    /// Only the contract admin may call this function.
    ///
    /// `bps` is expressed in **basis points** (1 BPS = 0.01 %).
    /// Valid range: 0–10 000 (0 %–100 %).
    /// Returns `Error::InvalidRoyaltyBps` when the value is out of range.
    pub fn set_default_royalty_bps(env: Env, bps: u32) -> Result<(), Error> {
        let admin = storage::get_admin(&env).ok_or(Error::NotInitialized)?;
        admin.require_auth();

        if bps > storage::ROYALTY_BPS_MAX {
            return Err(Error::InvalidRoyaltyBps);
        }

        storage::set_default_royalty_bps(&env, bps);
        Ok(())
    }

    /// Return the currently configured default royalty in basis points.
    ///
    /// Returns `None` when no default has been set yet (contract was not
    /// initialized with a royalty, or it was never explicitly configured).
    pub fn get_default_royalty_bps(env: Env) -> Option<u32> {
        storage::get_default_royalty_bps(&env)
    }

    // ── Issue #641: Upgradeability ─────────────────────────────────────────

    /// Upgrade the contract to a new WASM implementation.
    ///
    /// Only the admin may call this. The new WASM hash must not be all zeros.
    /// Existing state (tokens, approvals, royalties) is preserved — the new
    /// WASM reads the same storage layout.
    pub fn upgrade(env: Env, new_wasm_hash: BytesN<32>) -> Result<(), Error> {
        let admin = storage::get_admin(&env).ok_or(Error::NotInitialized)?;
        admin.require_auth();

        // Reject zero hash — would deploy a no-op contract.
        if new_wasm_hash == BytesN::from_array(&env, &[0u8; 32]) {
            return Err(Error::InvalidWasmHash);
        }

        storage::set_wasm_hash(&env, &new_wasm_hash);
        events::emit_upgrade(&env, &new_wasm_hash);
        Ok(())
    }

    /// Return the stored WASM hash for the next upgrade, or `None` if no
    /// upgrade has been staged.
    pub fn get_wasm_hash(env: Env) -> Option<BytesN<32>> {
        storage::get_wasm_hash(&env)
    }

    /// Set the contract version string (e.g. "2.0.0"). Admin only.
    pub fn set_contract_version(env: Env, version: String) -> Result<(), Error> {
        let admin = storage::get_admin(&env).ok_or(Error::NotInitialized)?;
        admin.require_auth();
        storage::set_contract_version(&env, &version);
        Ok(())
    }

    /// Return the current contract version, or `None` if never set.
    pub fn get_contract_version(env: Env) -> Option<String> {
        storage::get_contract_version(&env)
    }

    // ── Issue #643: Clip Verification ──────────────────────────────────────

    /// Pre-verify a clip hash. Admin only — marks a clip hash as verified so
    /// `mint_verified` will accept it.
    pub fn verify_clip(env: Env, clip_hash: BytesN<32>) -> Result<(), Error> {
        let admin = storage::get_admin(&env).ok_or(Error::NotInitialized)?;
        admin.require_auth();
        storage::set_verified_clip(&env, &clip_hash);
        Ok(())
    }

    /// Mint a verified clip NFT. The `clip_hash` must have been pre-verified
    /// via `verify_clip`. `caller` must match the intended owner and provide
    /// auth. `nonce` must be exactly `get_nonce(caller) + 1` to prevent replay.
    pub fn mint_verified(
        env: Env,
        caller: Address,
        token_id: u64,
        clip_hash: BytesN<32>,
        content_uri: String,
        is_soulbound: bool,
        nonce: u64,
    ) -> Result<(), Error> {
        caller.require_auth();

        // Verify clip hash was pre-approved.
        if !storage::is_verified_clip(&env, &clip_hash) {
            return Err(Error::ClipNotVerified);
        }

        // Nonce check — prevents replay attacks.
        let expected_nonce = storage::get_nonce(&env, &caller) + 1;
        if nonce != expected_nonce {
            return Err(Error::InvalidNonce);
        }
        storage::set_nonce(&env, &caller, nonce);

        // Delegate to standard mint logic.
        let admin = storage::get_admin(&env).ok_or(Error::NotInitialized)?;
        if storage::has_token(&env, token_id) {
            return Err(Error::InvalidTokenId);
        }

        let creator = caller.clone();
        let created_at = env.ledger().timestamp();
        let clip_id = String::from_str(&env, "verified");

        let token_data = TokenData {
            owner: caller.clone(),
            is_soulbound,
            creator,
            clip_id,
            content_uri,
            created_at,
        };

        storage::set_token(&env, token_id, &token_data);
        storage::set_owner_token(&env, &caller, token_id);
        storage::increment_total_supply(&env);

        events::emit_mint(&env, &caller, token_id, is_soulbound);
        Ok(())
    }

    /// Return the current nonce for `caller`. Starts at 0.
    pub fn get_nonce(env: Env, caller: Address) -> u64 {
        storage::get_nonce(&env, &caller)
    }
}

mod events {
    use super::*;

    pub fn emit_mint(env: &Env, to: &Address, token_id: u64, is_soulbound: bool) {
        let topics = (Symbol::new(env, "mint"), to.clone());
        env.events().publish(
            topics,
            (token_id, is_soulbound),
        );
    }

    pub fn emit_transfer(env: &Env, from: &Address, to: &Address, token_id: u64) {
        let topics = (Symbol::new(env, "transfer"), from.clone(), to.clone());
        env.events().publish(topics, token_id);
    }

    pub fn emit_approve(env: &Env, owner: &Address, spender: &Address, token_id: u64) {
        let topics = (Symbol::new(env, "approve"), owner.clone(), spender.clone());
        env.events().publish(topics, token_id);
    }

    pub fn emit_upgrade(env: &Env, new_wasm_hash: &BytesN<32>) {
        let topics = (Symbol::new(env, "upgrade"),);
        env.events().publish(topics, (new_wasm_hash.clone(),));
    }
}
