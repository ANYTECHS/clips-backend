#![no_std]
use soroban_sdk::{
    contract, contracterror, contractimpl, contractmeta, contracttype,
    Address, Env, String, Symbol, Vec,
};

mod admin;
mod metadata;
mod storage;

#[cfg(test)]
mod test;

pub use admin::Admin;
pub use metadata::ClipMetadata;
pub use storage::{get_token_metadata, set_token_metadata, TokenStorage, ROYALTY_BPS_MAX};

/// Contract name constant used in metadata and event topics.
const CLIP_NAME: &str = "ClipCash NFT";
/// Contract token symbol constant used in metadata.
const CLIP_SYMBOL: &str = "CLIP";

/// ClipCash NFT Soroban Smart Contract
///
/// Handles NFT minting, ownership, per-token royalties, and metadata on Stellar.
///
/// # Contract Metadata
/// - name: ClipCash NFT Contract
/// - version: 1.0.0
/// - symbol: CLIP
#[contractmeta(key = "name", val = "ClipCash NFT Contract")]
#[contractmeta(key = "version", val = "1.0.0")]
#[contractmeta(key = "symbol", val = "CLIP")]
#[contract]
pub struct ClipsNftContract;

/// On-chain data stored for every minted NFT token.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TokenData {
    pub owner: Address,
    pub is_soulbound: bool,
    pub creator: Address,
    pub clip_id: String,
    pub content_uri: String,
    pub created_at: u64,
    /// Per-token royalty in basis points (0–1500). Overrides the contract default when set.
    pub royalty_bps: u32,
    /// Wallet that receives royalty payments for this token.
    pub royalty_recipient: Address,
}

/// Royalty information for a single recipient (used by `get_royalties`).
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RoyaltyInfo {
    pub recipient: Address,
    pub bps: u32,
}

/// Errors returned by the ClipCash NFT contract.
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
    /// Royalty value exceeds the allowed 0–1500 BPS cap (15%).
    InvalidRoyaltyBps = 7,
    /// A token for this clip_id has already been minted (duplicate prevention).
    DuplicateClipId = 8,
}

#[contractimpl]
impl ClipsNftContract {
    /// Initialize the contract with an admin/owner and an optional default royalty BPS.
    ///
    /// Must be called once before any other mutable operations.
    /// Returns `Error::AlreadyInitialized` if called more than once.
    ///
    /// # Arguments
    /// - `admin`       — The contract owner/admin address that controls minting.
    /// - `royalty_bps` — Default royalty in basis points (0–1500). Pass `0` for no royalty.
    pub fn initialize(env: Env, admin: Address, royalty_bps: u32) -> Result<(), Error> {
        if storage::has_admin(&env) {
            return Err(Error::AlreadyInitialized);
        }

        if royalty_bps > ROYALTY_BPS_MAX {
            return Err(Error::InvalidRoyaltyBps);
        }

        storage::set_admin(&env, &admin);
        storage::set_owner(&env, &admin);
        storage::set_default_royalty_bps(&env, royalty_bps);

        events::emit_initialized(&env, &admin, royalty_bps);
        Ok(())
    }

    /// Return the contract owner address (set during `initialize`).
    pub fn get_owner(env: Env) -> Option<Address> {
        storage::get_owner(&env)
    }

    /// Return basic contract information for frontend integration.
    ///
    /// # Returns
    /// A `ContractInfo` struct with contract_id placeholder, network, version, name, and symbol.
    pub fn contract_info(env: Env) -> ContractInfo {
        let version = String::from_str(&env, "1.0.0");
        let name = String::from_str(&env, CLIP_NAME);
        let symbol = String::from_str(&env, CLIP_SYMBOL);
        ContractInfo { version, name, symbol }
    }

    /// Mint a new NFT for a given clip.
    ///
    /// Only the contract admin can call this function.
    ///
    /// # Arguments
    /// - `to`              — Recipient address that will own the minted NFT.
    /// - `token_id`        — Unique numeric token ID for this NFT.
    /// - `clip_id`         — ClipCash clip identifier (must be unique — prevents duplicate minting).
    /// - `content_uri`     — IPFS/Arweave metadata URI for this clip.
    /// - `is_soulbound`    — When `true` the NFT cannot be transferred.
    /// - `royalty_bps`     — Per-token creator royalty in BPS (0–1500). Uses contract default when `0`.
    ///
    /// # Errors
    /// - `NotInitialized`  — Contract hasn't been initialized yet.
    /// - `InvalidTokenId`  — `token_id` is already in use.
    /// - `DuplicateClipId` — A token for this `clip_id` was already minted.
    /// - `InvalidRoyaltyBps` — `royalty_bps` > 1500.
    pub fn mint(
        env: Env,
        to: Address,
        token_id: u64,
        clip_id: String,
        content_uri: String,
        is_soulbound: bool,
        royalty_bps: u32,
    ) -> Result<(), Error> {
        let admin = storage::get_admin(&env).ok_or(Error::NotInitialized)?;
        admin.require_auth();

        // Prevent duplicate token_id
        if storage::has_token(&env, token_id) {
            return Err(Error::InvalidTokenId);
        }

        // Prevent duplicate clip_id minting
        if storage::has_clip_id(&env, &clip_id) {
            return Err(Error::DuplicateClipId);
        }

        // Resolve effective royalty — fall back to contract default
        let effective_royalty = if royalty_bps == 0 {
            storage::get_default_royalty_bps(&env).unwrap_or(0)
        } else {
            royalty_bps
        };

        if effective_royalty > ROYALTY_BPS_MAX {
            return Err(Error::InvalidRoyaltyBps);
        }

        let creator = to.clone();
        let created_at = env.ledger().timestamp();

        let token_data = TokenData {
            owner: to.clone(),
            is_soulbound,
            creator: creator.clone(),
            clip_id: clip_id.clone(),
            content_uri,
            created_at,
            royalty_bps: effective_royalty,
            royalty_recipient: creator,
        };

        storage::set_token(&env, token_id, &token_data);
        storage::set_owner_token(&env, &to, token_id);
        storage::set_clip_id_token(&env, &clip_id, token_id);
        storage::increment_total_supply(&env);

        events::emit_mint(&env, &to, token_id, &clip_id, is_soulbound, effective_royalty);
        Ok(())
    }

    /// Update the per-token royalty for a minted NFT.
    ///
    /// Only the token creator (stored in `TokenData.creator`) may update royalty.
    ///
    /// # Arguments
    /// - `token_id`  — Token whose royalty should be updated.
    /// - `bps`       — New royalty in basis points (0–1500).
    /// - `recipient` — Wallet address that will receive the royalty.
    ///
    /// # Errors
    /// - `TokenNotFound`    — No token with this ID.
    /// - `Unauthorized`     — Caller is not the token creator.
    /// - `InvalidRoyaltyBps`— `bps` > 1500.
    pub fn set_royalty(
        env: Env,
        caller: Address,
        token_id: u64,
        bps: u32,
        recipient: Address,
    ) -> Result<(), Error> {
        caller.require_auth();

        let mut token_data = storage::get_token(&env, token_id).ok_or(Error::TokenNotFound)?;

        if token_data.creator != caller {
            return Err(Error::Unauthorized);
        }

        if bps > ROYALTY_BPS_MAX {
            return Err(Error::InvalidRoyaltyBps);
        }

        token_data.royalty_bps = bps;
        token_data.royalty_recipient = recipient.clone();
        storage::set_token(&env, token_id, &token_data);

        events::emit_royalty_updated(&env, token_id, &recipient, bps);
        Ok(())
    }

    /// Return the royalty information for a specific token.
    ///
    /// Returns `None` when the token does not exist.
    ///
    /// # Response
    /// A `RoyaltyInfo` with `recipient` address and `bps` (basis points).
    pub fn get_royalties(env: Env, token_id: u64) -> Option<RoyaltyInfo> {
        storage::get_token(&env, token_id).map(|t| RoyaltyInfo {
            recipient: t.royalty_recipient,
            bps: t.royalty_bps,
        })
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
    /// Valid range: 0–1500 (0%–15%).
    /// Returns `Error::InvalidRoyaltyBps` when the value is out of range.
    pub fn set_default_royalty_bps(env: Env, bps: u32) -> Result<(), Error> {
        let admin = storage::get_admin(&env).ok_or(Error::NotInitialized)?;
        admin.require_auth();

        if bps > ROYALTY_BPS_MAX {
            return Err(Error::InvalidRoyaltyBps);
        }

        storage::set_default_royalty_bps(&env, bps);
        Ok(())
    }

    /// Return the currently configured default royalty in basis points.
    ///
    /// Returns `None` when no default has been set yet.
    pub fn get_default_royalty_bps(env: Env) -> Option<u32> {
        storage::get_default_royalty_bps(&env)
    }
}

/// Contract metadata returned by `contract_info()`.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ContractInfo {
    pub version: String,
    pub name: String,
    pub symbol: String,
}

mod events {
    use super::*;

    pub fn emit_initialized(env: &Env, admin: &Address, royalty_bps: u32) {
        let topics = (Symbol::new(env, "initialized"), admin.clone());
        env.events().publish(topics, royalty_bps);
    }

    pub fn emit_mint(
        env: &Env,
        to: &Address,
        token_id: u64,
        clip_id: &String,
        is_soulbound: bool,
        royalty_bps: u32,
    ) {
        let topics = (Symbol::new(env, "mint"), to.clone());
        env.events().publish(
            topics,
            (token_id, clip_id.clone(), is_soulbound, royalty_bps),
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

    pub fn emit_royalty_updated(env: &Env, token_id: u64, recipient: &Address, bps: u32) {
        let topics = (Symbol::new(env, "royalty_set"), recipient.clone());
        env.events().publish(topics, (token_id, bps));
    }
}
