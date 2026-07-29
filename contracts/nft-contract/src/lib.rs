#![no_std]
use soroban_sdk::{
    contract, contracterror, contractimpl, contractmeta, contracttype,
    Address, Env, Map, String, Symbol, Val,
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

    /// Permanently destroy a token. Only the current owner may burn it.
    ///
    /// Ownership, metadata, royalty overrides and any outstanding approval
    /// are all removed from storage, so the token can never be transferred
    /// again — `transfer`/`transfer_from`/`approve` all fail with
    /// `Error::TokenNotFound` once a token has been burned.
    pub fn burn(env: Env, owner: Address, token_id: u64) -> Result<(), Error> {
        owner.require_auth();

        let token_data = storage::get_token(&env, token_id).ok_or(Error::TokenNotFound)?;
        if token_data.owner != owner {
            return Err(Error::Unauthorized);
        }

        storage::remove_owner_token(&env, &owner, token_id);
        storage::remove_token(&env, token_id);
        storage::remove_token_metadata(&env, token_id);
        storage::remove_approval(&env, token_id);
        storage::decrement_total_supply(&env);

        events::emit_burn(&env, &owner, token_id);
        Ok(())
    }

    /// Set the admin-configured platform recipient + fee (in BPS) used as a
    /// fallback royalty share for tokens that have no per-token override.
    pub fn set_default_platform_fee(env: Env, recipient: Address, bps: u32) -> Result<(), Error> {
        let admin = storage::get_admin(&env).ok_or(Error::NotInitialized)?;
        admin.require_auth();

        if bps > storage::ROYALTY_BPS_MAX {
            return Err(Error::InvalidRoyaltyBps);
        }

        storage::set_platform_fee(&env, &recipient, bps);
        Ok(())
    }

    /// Return the currently configured default platform recipient + fee, if any.
    pub fn get_default_platform_fee(env: Env) -> Option<(Address, u32)> {
        storage::get_platform_fee(&env)
    }

    /// Configure the royalty split for a specific token, overriding the
    /// default royalty/platform fee fallback. Only the token owner may call
    /// this. `royalties` maps each recipient to their share in basis points;
    /// the combined total must not exceed `storage::ROYALTY_BPS_MAX`
    /// (10 000 = 100%).
    pub fn set_royalties(
        env: Env,
        token_id: u64,
        royalties: Map<Address, u32>,
    ) -> Result<(), Error> {
        let token_data = storage::get_token(&env, token_id).ok_or(Error::TokenNotFound)?;
        token_data.owner.require_auth();

        let mut total: u32 = 0;
        for (_, bps) in royalties.iter() {
            total = total.saturating_add(bps);
        }
        if total > storage::ROYALTY_BPS_MAX {
            return Err(Error::InvalidRoyaltyBps);
        }

        storage::set_royalty_shares(&env, token_id, &royalties);
        events::emit_royalties_updated(&env, token_id, total);
        Ok(())
    }

    /// Return the royalty split for a token: an explicit per-token override
    /// when one has been configured via `set_royalties`, otherwise a
    /// fallback built from the default royalty BPS (creator) plus the
    /// configured platform fee, if any.
    pub fn get_royalties(env: Env, token_id: u64) -> Map<Address, u32> {
        if let Some(royalties) = storage::get_royalty_shares(&env, token_id) {
            return royalties;
        }

        let mut royalties = Map::new(&env);
        let Some(token_data) = storage::get_token(&env, token_id) else {
            return royalties;
        };
        let Some(default_bps) = storage::get_default_royalty_bps(&env) else {
            return royalties;
        };

        match storage::get_platform_fee(&env) {
            Some((platform_recipient, platform_bps)) => {
                let creator_bps = default_bps.saturating_sub(platform_bps);
                if creator_bps > 0 {
                    royalties.set(token_data.creator, creator_bps);
                }
                if platform_bps > 0 {
                    royalties.set(platform_recipient, platform_bps);
                }
            }
            None => {
                if default_bps > 0 {
                    royalties.set(token_data.creator, default_bps);
                }
            }
        }

        royalties
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

    pub fn emit_burn(env: &Env, owner: &Address, token_id: u64) {
        let topics = (Symbol::new(env, "burn"), owner.clone());
        env.events().publish(topics, token_id);
    }

    pub fn emit_royalties_updated(env: &Env, token_id: u64, total_bps: u32) {
        let topics = (Symbol::new(env, "royalties_updated"), token_id);
        env.events().publish(topics, total_bps);
    }
}
