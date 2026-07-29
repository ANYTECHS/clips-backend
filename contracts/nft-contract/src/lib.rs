#![no_std]
use soroban_sdk::{
    contract, contracterror, contractimpl, contractmeta, contracttype,
    token, Address, Env, String, Symbol, Val, Vec,
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
pub const MAX_BATCH_SIZE: u32 = 50;

contractmeta!(key = "name", val = "ClipCash NFT Contract");
contractmeta!(key = "version", val = "1.0.0");

#[contract]
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

/// Returned by `transfer_with_royalty` to let callers inspect the
/// computed royalty without having to replay the BPS arithmetic.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RoyaltyInfo {
    /// Creator / royalty recipient address.
    pub recipient: Address,
    /// Royalty amount in the same units as `sale_price`.
    pub royalty_amount: u64,
    /// Royalty rate used, expressed in basis points (1 BPS = 0.01 %).
    pub royalty_bps: u32,
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
    /// The contract is paused; minting and transfers are disabled.
    ContractPaused = 8,
    /// The asset contract address is not on the admin-approved allow-list.
    UnsupportedAsset = 9,
    /// Provided WASM hash is all zeros — cannot upgrade to a no-op contract.
    InvalidWasmHash = 8,
    /// Clip signature verification failed — caller is not the clip owner.
    InvalidSignature = 9,
    /// Nonce is stale — replay attack detected.
    InvalidNonce = 10,
    /// Clip hash was not pre-verified by the admin.
    ClipNotVerified = 11,
    /// Array lengths do not match for batch operation.
    ArrayLengthMismatch = 12,
    /// Batch size is 0 or exceeds maximum allowable limit.
    InvalidBatchSize = 13,
    /// One-time metadata update limit reached for token ID.
    MetadataAlreadyUpdated = 14,
}

#[contractimpl]
impl ClipsNftContract {
    /// Return collection name (Issue #686).
    pub fn name(env: Env) -> String {
        String::from_str(&env, "ClipCash NFT")
    }

    /// Return collection symbol (Issue #686).
    pub fn symbol(env: Env) -> String {
        String::from_str(&env, "CLIP")
    }

    /// Initialise the contract and set the admin address.
    pub fn initialize(env: Env, admin: Address) -> Result<(), Error> {
        if storage::has_admin(&env) {
            return Err(Error::AlreadyInitialized);
        }
        admin.require_auth();
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

        if storage::is_paused(&env) {
            return Err(Error::ContractPaused);
        }

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

    /// Mint multiple clip NFTs in a single transaction (Issue #671).
    pub fn batch_mint(
        env: Env,
        to: Address,
        token_ids: Vec<u64>,
        clip_ids: Vec<String>,
        content_uris: Vec<String>,
        is_soulbound: Vec<bool>,
    ) -> Result<(), Error> {
        let admin = storage::get_admin(&env).ok_or(Error::NotInitialized)?;
        admin.require_auth();

        let len = token_ids.len();
        if len == 0 || len > MAX_BATCH_SIZE {
            return Err(Error::InvalidBatchSize);
        }

        if clip_ids.len() != len || content_uris.len() != len || is_soulbound.len() != len {
            return Err(Error::ArrayLengthMismatch);
        }

        let creator = to.clone();
        let created_at = env.ledger().timestamp();

        for i in 0..len {
            let token_id = token_ids.get(i).unwrap();
            if storage::has_token(&env, token_id) {
                return Err(Error::InvalidTokenId);
            }

            let clip_id = clip_ids.get(i).unwrap();
            let content_uri = content_uris.get(i).unwrap();
            let soulbound = is_soulbound.get(i).unwrap();

            let token_data = TokenData {
                owner: to.clone(),
                is_soulbound: soulbound,
                creator: creator.clone(),
                clip_id,
                content_uri,
                created_at,
            };

            storage::set_token(&env, token_id, &token_data);
            storage::set_owner_token(&env, &to, token_id);
            storage::increment_total_supply(&env);
        }

        events::emit_batch_mint(&env, &to, len as u32);
        Ok(())
    }

    /// Set custom per-token URI (Issue #670). Restrict updates to the NFT owner.
    pub fn set_token_uri(env: Env, token_id: u64, uri: String) -> Result<(), Error> {
        let token_data = storage::get_token(&env, token_id).ok_or(Error::TokenNotFound)?;
        token_data.owner.require_auth();

        storage::set_custom_token_uri(&env, token_id, &uri);
        events::emit_token_uri_updated(&env, token_id, &token_data.owner, &uri);
        Ok(())
    }

    /// Return token URI (returns custom URI if set, or initial content_uri).
    pub fn token_uri(env: Env, token_id: u64) -> Option<String> {
        if !storage::has_token(&env, token_id) {
            return None;
        }
        storage::get_custom_token_uri(&env, token_id)
            .or_else(|| storage::get_token(&env, token_id).map(|t| t.content_uri))
    }

    /// Update royalty recipient address for a given token ID (Issue #672).
    /// Only the current recipient can update. Emits RoyaltyRecipientUpdated.
    pub fn update_royalty_recipient(
        env: Env,
        token_id: u64,
        new_recipient: Address,
    ) -> Result<(), Error> {
        let current_recipient = Self::get_royalty_recipient(env.clone(), token_id)
            .ok_or(Error::TokenNotFound)?;

        current_recipient.require_auth();

        storage::set_token_royalty_recipient(&env, token_id, &new_recipient);
        events::emit_royalty_recipient_updated(&env, token_id, &current_recipient, &new_recipient);
        Ok(())
    }

    /// Retrieve the current royalty recipient address for a given token ID.
    pub fn get_royalty_recipient(env: Env, token_id: u64) -> Option<Address> {
        if !storage::has_token(&env, token_id) {
            return None;
        }
        storage::get_token_royalty_recipient(&env, token_id)
            .or_else(|| storage::get_token(&env, token_id).map(|t| t.creator))
    }

    /// Perform a one-time metadata update after minting (Issue #683).
    /// Restricts updates strictly to the NFT owner and allows only one update.
    pub fn update_metadata(
        env: Env,
        token_id: u64,
        new_metadata: ClipMetadata,
    ) -> Result<(), Error> {
        let mut token_data = storage::get_token(&env, token_id).ok_or(Error::TokenNotFound)?;
        token_data.owner.require_auth();

        if storage::is_metadata_updated(&env, token_id) {
            return Err(Error::MetadataAlreadyUpdated);
        }

        token_data.content_uri = new_metadata.content_uri.clone();
        storage::set_token(&env, token_id, &token_data);
        storage::set_token_metadata(&env, token_id, &new_metadata);
        storage::set_metadata_updated(&env, token_id);

        events::emit_metadata_updated(&env, token_id, &token_data.owner, &new_metadata);
        Ok(())
    }

    /// Calculate fractional royalty for assets with custom decimal precision (Issue #685).
    pub fn calculate_fractional_royalty(
        _env: Env,
        sale_price: u128,
        royalty_bps: u32,
        _asset_decimals: u32,
    ) -> u128 {
        if royalty_bps == 0 || sale_price == 0 || royalty_bps > storage::ROYALTY_BPS_MAX {
            return 0;
        }
        (sale_price * (royalty_bps as u128)) / (storage::ROYALTY_BPS_MAX as u128)
    }

    pub fn transfer(
        env: Env,
        from: Address,
        to: Address,
        token_id: u64,
    ) -> Result<(), Error> {
        from.require_auth();

        if storage::is_paused(&env) {
            return Err(Error::ContractPaused);
        }

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

    pub fn transfer_with_royalty(
        env: Env,
        from: Address,
        to: Address,
        token_id: u64,
        sale_price: u64,
    ) -> Result<RoyaltyInfo, Error> {
        from.require_auth();

        let token_data = storage::get_token(&env, token_id).ok_or(Error::TokenNotFound)?;

        if token_data.owner != from {
            return Err(Error::Unauthorized);
        }

        if token_data.is_soulbound {
            return Err(Error::SoulboundTokenNotTransferable);
        }

        let royalty_bps: u32 = storage::get_token_royalty_bps(&env, token_id)
            .or_else(|| storage::get_default_royalty_bps(&env))
            .unwrap_or(0);

        let royalty_amount: u64 = if royalty_bps == 0 || sale_price == 0 {
            0
        } else {
            sale_price * (royalty_bps as u64) / (storage::ROYALTY_BPS_MAX as u64)
        };

        let recipient = Self::get_royalty_recipient(env.clone(), token_id)
            .unwrap_or_else(|| token_data.creator.clone());

        storage::remove_owner_token(&env, &from, token_id);
        storage::set_owner_token(&env, &to, token_id);

        let mut updated_token = token_data;
        updated_token.owner = to.clone();
        storage::set_token(&env, token_id, &updated_token);

        events::emit_transfer(&env, &from, &to, token_id);

        if royalty_amount > 0 {
            events::emit_royalty_paid(
                &env,
                &recipient,
                token_id,
                royalty_amount,
                royalty_bps,
                sale_price,
            );
        }

        Ok(RoyaltyInfo {
            recipient,
            royalty_amount,
            royalty_bps,
        })
    }

    pub fn transfer_from(
        env: Env,
        spender: Address,
        from: Address,
        to: Address,
        token_id: u64,
    ) -> Result<(), Error> {
        spender.require_auth();

        if storage::is_paused(&env) {
            return Err(Error::ContractPaused);
        }

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

        if storage::is_paused(&env) {
            return Err(Error::ContractPaused);
        }

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

    pub fn get_metadata(env: Env, token_id: u64) -> Option<ClipMetadata> {
        storage::get_token_metadata(&env, token_id)
    }

    pub fn set_metadata(env: Env, token_id: u64, metadata: ClipMetadata) -> Result<(), Error> {
        let admin = storage::get_admin(&env).ok_or(Error::NotInitialized)?;
        admin.require_auth();

        if !storage::has_token(&env, token_id) {
            return Err(Error::TokenNotFound);
        }

        storage::set_token_metadata(&env, token_id, &metadata);
        Ok(())
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

    pub fn set_default_royalty_bps(env: Env, bps: u32) -> Result<(), Error> {
        let admin = storage::get_admin(&env).ok_or(Error::NotInitialized)?;
        admin.require_auth();

        if bps > storage::ROYALTY_BPS_MAX {
            return Err(Error::InvalidRoyaltyBps);
        }

        let old_bps = storage::get_default_royalty_bps(&env).unwrap_or(0);
        storage::set_default_royalty_bps(&env, bps);
        events::emit_royalty_updated(&env, old_bps, bps);
        Ok(())
    }

    pub fn get_default_royalty_bps(env: Env) -> Option<u32> {
        storage::get_default_royalty_bps(&env)
    }

    /// Pause the contract. While paused, `mint`, `transfer`, `transfer_from`,
    /// and `approve` are rejected with `Error::ContractPaused`.
    ///
    /// Only the contract admin may call this function.
    pub fn pause(env: Env) -> Result<(), Error> {
        let admin = storage::get_admin(&env).ok_or(Error::NotInitialized)?;
        admin.require_auth();

        storage::set_paused(&env, true);
        events::emit_paused(&env, &admin);
        Ok(())
    }

    /// Unpause the contract, restoring minting and transfer functionality.
    ///
    /// Only the contract admin may call this function.
    pub fn unpause(env: Env) -> Result<(), Error> {
        let admin = storage::get_admin(&env).ok_or(Error::NotInitialized)?;
        admin.require_auth();

        storage::set_paused(&env, false);
        events::emit_unpaused(&env, &admin);
        Ok(())
    }

    /// Return whether the contract is currently paused.
    pub fn is_paused(env: Env) -> bool {
        storage::is_paused(&env)
    }

    /// Set the Stellar asset contract (SAC) address that royalties are paid
    /// in by default (e.g. the native XLM SAC or a USDC SAC address).
    ///
    /// The asset must already be on the admin-approved allow-list
    /// (see `add_supported_asset`). Only the contract admin may call this.
    pub fn set_default_royalty_asset(env: Env, asset: Address) -> Result<(), Error> {
        let admin = storage::get_admin(&env).ok_or(Error::NotInitialized)?;
        admin.require_auth();

        if !storage::is_supported_asset(&env, &asset) {
            return Err(Error::UnsupportedAsset);
        }

        storage::set_default_royalty_asset(&env, &asset);
        Ok(())
    }

    /// Return the currently configured default royalty asset, if any.
    pub fn get_default_royalty_asset(env: Env) -> Option<Address> {
        storage::get_default_royalty_asset(&env)
    }

    /// Add an asset contract address to the admin-approved allow-list of
    /// assets that may be used for royalty payouts.
    ///
    /// Only the contract admin may call this function.
    pub fn add_supported_asset(env: Env, asset: Address) -> Result<(), Error> {
        let admin = storage::get_admin(&env).ok_or(Error::NotInitialized)?;
        admin.require_auth();

        storage::add_supported_asset(&env, &asset);
        Ok(())
    }

    /// Remove an asset contract address from the royalty allow-list.
    ///
    /// Only the contract admin may call this function.
    pub fn remove_supported_asset(env: Env, asset: Address) -> Result<(), Error> {
        let admin = storage::get_admin(&env).ok_or(Error::NotInitialized)?;
        admin.require_auth();

        storage::remove_supported_asset(&env, &asset);
        Ok(())
    }

    /// Return whether `asset` is on the royalty allow-list.
    pub fn is_supported_asset(env: Env, asset: Address) -> bool {
        storage::is_supported_asset(&env, &asset)
    }

    /// Pay the royalty owed on `token_id` to its creator, in `asset`.
    ///
    /// `asset` must be on the admin-approved allow-list. `amount` is the
    /// sale price the royalty is computed from; the transferred amount is
    /// `amount * royalty_bps / 10_000`, using the token's configured
    /// royalty rate (falling back to the contract default). `payer` must
    /// authorize the call and hold a sufficient balance of `asset`.
    pub fn pay_royalty(
        env: Env,
        payer: Address,
        token_id: u64,
        asset: Address,
        amount: i128,
    ) -> Result<i128, Error> {
        payer.require_auth();

        if !storage::is_supported_asset(&env, &asset) {
            return Err(Error::UnsupportedAsset);
        }

        let token_data = storage::get_token(&env, token_id).ok_or(Error::TokenNotFound)?;
        let bps = storage::get_default_royalty_bps(&env).unwrap_or(0);
        let royalty_amount = amount.saturating_mul(bps as i128) / (ROYALTY_BPS_MAX as i128);

        if royalty_amount > 0 {
            let asset_client = token::Client::new(&env, &asset);
            asset_client.transfer(&payer, &token_data.creator, &royalty_amount);
        }

        events::emit_royalty_paid(&env, &payer, &token_data.creator, &asset, token_id, royalty_amount);
        Ok(royalty_amount)
    pub fn pay_royalty(
        env: Env,
        token_id: u64,
        payer: Address,
        amount_stroops: u64,
    ) -> Result<(), Error> {
        payer.require_auth();

        let token_data = storage::get_token(&env, token_id).ok_or(Error::TokenNotFound)?;

        let recipient = Self::get_royalty_recipient(env.clone(), token_id)
            .unwrap_or_else(|| token_data.creator.clone());

        events::emit_royalty_paid(
            &env,
            &recipient,
            token_id,
            amount_stroops,
            0,
            amount_stroops,
        );
        Ok(())
    }

    pub fn set_token_royalty_bps(env: Env, token_id: u64, bps: u32) -> Result<(), Error> {
        let admin = storage::get_admin(&env).ok_or(Error::NotInitialized)?;
        admin.require_auth();

        if !storage::has_token(&env, token_id) {
            return Err(Error::TokenNotFound);
        }

        if bps > storage::ROYALTY_BPS_MAX {
            return Err(Error::InvalidRoyaltyBps);
        }

        storage::set_token_royalty_bps(&env, token_id, bps);
        Ok(())
    }

    pub fn get_token_royalty_bps(env: Env, token_id: u64) -> Option<u32> {
        storage::get_token_royalty_bps(&env, token_id)
    }

    pub fn upgrade(env: Env, new_wasm_hash: BytesN<32>) -> Result<(), Error> {
        let admin = storage::get_admin(&env).ok_or(Error::NotInitialized)?;
        admin.require_auth();

        if new_wasm_hash == BytesN::from_array(&env, &[0u8; 32]) {
            return Err(Error::InvalidWasmHash);
        }

        storage::set_wasm_hash(&env, &new_wasm_hash);
        events::emit_upgrade(&env, &new_wasm_hash);
        Ok(())
    }

    pub fn get_wasm_hash(env: Env) -> Option<BytesN<32>> {
        storage::get_wasm_hash(&env)
    }

    pub fn set_contract_version(env: Env, version: String) -> Result<(), Error> {
        let admin = storage::get_admin(&env).ok_or(Error::NotInitialized)?;
        admin.require_auth();
        storage::set_contract_version(&env, &version);
        Ok(())
    }

    pub fn get_contract_version(env: Env) -> Option<String> {
        storage::get_contract_version(&env)
    }

    pub fn verify_clip(env: Env, clip_hash: BytesN<32>) -> Result<(), Error> {
        let admin = storage::get_admin(&env).ok_or(Error::NotInitialized)?;
        admin.require_auth();
        storage::set_verified_clip(&env, &clip_hash);
        Ok(())
    }

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

        if !storage::is_verified_clip(&env, &clip_hash) {
            return Err(Error::ClipNotVerified);
        }

        let expected_nonce = storage::get_nonce(&env, &caller) + 1;
        if nonce != expected_nonce {
            return Err(Error::InvalidNonce);
        }
        storage::set_nonce(&env, &caller, nonce);

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

    pub fn get_nonce(env: Env, caller: Address) -> u64 {
        storage::get_nonce(&env, &caller)
    }
}

mod events {
    use super::*;

    pub fn emit_mint(env: &Env, to: &Address, token_id: u64, is_soulbound: bool) {
        let topics = (Symbol::new(env, "mint"), to.clone());
        env.events().publish(topics, (token_id, is_soulbound));
    }

    pub fn emit_batch_mint(env: &Env, to: &Address, count: u32) {
        let topics = (Symbol::new(env, "batch_mint"), to.clone());
        env.events().publish(topics, count);
    }

    pub fn emit_token_uri_updated(env: &Env, token_id: u64, owner: &Address, uri: &String) {
        let topics = (Symbol::new(env, "token_uri_updated"), token_id, owner.clone());
        env.events().publish(topics, uri.clone());
    }

    pub fn emit_transfer(env: &Env, from: &Address, to: &Address, token_id: u64) {
        let topics = (Symbol::new(env, "transfer"), from.clone(), to.clone());
        env.events().publish(topics, token_id);
    }

    pub fn emit_approve(env: &Env, owner: &Address, spender: &Address, token_id: u64) {
        let topics = (Symbol::new(env, "approve"), owner.clone(), spender.clone());
        env.events().publish(topics, token_id);
    }

    pub fn emit_paused(env: &Env, admin: &Address) {
        let topics = (Symbol::new(env, "paused"), admin.clone());
        env.events().publish(topics, ());
    }

    pub fn emit_unpaused(env: &Env, admin: &Address) {
        let topics = (Symbol::new(env, "unpaused"), admin.clone());
        env.events().publish(topics, ());
    pub fn emit_royalty_updated(env: &Env, old_bps: u32, new_bps: u32) {
        let topics = (Symbol::new(env, "royalty_updated"),);
        env.events().publish(topics, (old_bps, new_bps));
    }

    pub fn emit_royalty_paid(
        env: &Env,
        payer: &Address,
        recipient: &Address,
        asset: &Address,
        token_id: u64,
        amount: i128,
    ) {
        let topics = (Symbol::new(env, "royalty_paid"), payer.clone(), recipient.clone());
        env.events().publish(topics, (asset.clone(), token_id, amount));
        recipient: &Address,
        token_id: u64,
        royalty_amount: u64,
        royalty_bps: u32,
        sale_price: u64,
    ) {
        let topics = (Symbol::new(env, "royalty_paid"), recipient.clone());
        env.events().publish(
            topics,
            (token_id, royalty_amount, royalty_bps, sale_price),
        );
    }

    pub fn emit_upgrade(env: &Env, new_wasm_hash: &BytesN<32>) {
        let topics = (Symbol::new(env, "upgrade"),);
        env.events().publish(topics, (new_wasm_hash.clone(),));
    }

    pub fn emit_royalty_recipient_updated(
        env: &Env,
        token_id: u64,
        old_recipient: &Address,
        new_recipient: &Address,
    ) {
        let topics = (Symbol::new(env, "royalty_recipient_updated"), token_id);
        env.events().publish(topics, (old_recipient.clone(), new_recipient.clone()));
    }

    pub fn emit_metadata_updated(
        env: &Env,
        token_id: u64,
        owner: &Address,
        metadata: &ClipMetadata,
    ) {
        let topics = (Symbol::new(env, "metadata_updated"), token_id, owner.clone());
        env.events().publish(topics, metadata.clone());
    }
}
