#![no_std]
use soroban_sdk::{
    contract, contracterror, contractimpl, contractmeta, contracttype,
    token, Address, Env, String, Symbol, Val, Vec,
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
    /// The contract is paused; minting and transfers are disabled.
    ContractPaused = 8,
    /// The asset contract address is not on the admin-approved allow-list.
    UnsupportedAsset = 9,
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

    pub fn emit_paused(env: &Env, admin: &Address) {
        let topics = (Symbol::new(env, "paused"), admin.clone());
        env.events().publish(topics, ());
    }

    pub fn emit_unpaused(env: &Env, admin: &Address) {
        let topics = (Symbol::new(env, "unpaused"), admin.clone());
        env.events().publish(topics, ());
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
    }
}
