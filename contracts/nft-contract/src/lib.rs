#![no_std]
use soroban_sdk::{
    contract, contracterror, contractimpl, contractmeta, contracttype,
    xdr::ToXdr, Address, Bytes, BytesN, Env, String, Symbol, Val, Vec,
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

/// Custom contract errors. Codes are stable and mapped by the backend
/// (`src/nft/contract-errors.ts`) to HTTP responses.
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    /// Caller is not the admin / owner / approved operator. → 403
    Unauthorized = 1,
    /// Token id does not exist. → 404
    TokenNotFound = 2,
    /// `initialize` was already called. → 409
    AlreadyInitialized = 3,
    /// Contract has not been initialized with an admin. → 500
    NotInitialized = 4,
    /// Soulbound tokens cannot be transferred or approved. → 409
    SoulboundTokenNotTransferable = 5,
    /// Token id is already in use. → 409
    InvalidTokenId = 6,
    /// Royalty value is outside the valid 0–10 000 BPS range. → 400
    InvalidRoyaltyBps = 7,
    /// The clip has already been minted as an NFT. → 409
    ClipAlreadyMinted = 8,
    /// Wallet does not hold enough tokens for the operation. → 400
    InsufficientBalance = 9,
    /// Contract is paused by the admin. → 409
    ContractPaused = 10,
    /// Token is frozen and cannot be moved. → 409
    TokenFrozen = 11,
    /// Wallet is still inside its mint cooldown window. → 429
    CooldownActive = 12,
    /// Mint authorization signature is invalid or no signer configured. → 401
    InvalidSignature = 13,
    /// Mint authorization has passed its expiration timestamp. → 401
    SignatureExpired = 14,
    /// Mint authorization nonce was already used (replay). → 409
    NonceAlreadyUsed = 15,
    /// No approval exists to revoke. → 404
    ApprovalNotFound = 16,
}

/// Payload signed off-chain by the backend to authorize a mint.
/// Serialized with XDR and verified with Ed25519 on-chain.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MintAuthorization {
    pub contract: Address,
    pub recipient: Address,
    pub token_id: u64,
    pub clip_id: String,
    pub metadata_uri: String,
    pub nonce: u64,
    pub expiration: u64,
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
        Self::do_mint(&env, to, token_id, clip_id, content_uri, is_soulbound)
    }

    /// Admin: set the backend Ed25519 public key allowed to sign mint authorizations.
    pub fn set_mint_signer(env: Env, public_key: BytesN<32>) -> Result<(), Error> {
        let admin = storage::get_admin(&env).ok_or(Error::NotInitialized)?;
        admin.require_auth();
        storage::set_mint_signer(&env, &public_key);
        Ok(())
    }

    pub fn get_mint_signer(env: Env) -> Option<BytesN<32>> {
        storage::get_mint_signer(&env)
    }

    /// Mint using a backend-signed authorization instead of an admin call.
    /// The signature covers contract, recipient, token, clip, URI, nonce and
    /// expiration, so any modification invalidates it. Nonces are single-use.
    pub fn mint_with_signature(
        env: Env,
        recipient: Address,
        token_id: u64,
        clip_id: String,
        metadata_uri: String,
        nonce: u64,
        expiration: u64,
        signature: BytesN<64>,
    ) -> Result<(), Error> {
        recipient.require_auth();
        let signer = storage::get_mint_signer(&env).ok_or(Error::InvalidSignature)?;

        if env.ledger().timestamp() > expiration {
            return Err(Error::SignatureExpired);
        }
        if storage::is_nonce_used(&env, nonce) {
            return Err(Error::NonceAlreadyUsed);
        }

        let payload = Self::mint_authorization_payload(
            env.clone(),
            recipient.clone(),
            token_id,
            clip_id.clone(),
            metadata_uri.clone(),
            nonce,
            expiration,
        );
        // Traps (tx fails) if the signature does not match the payload.
        env.crypto().ed25519_verify(&signer, &payload, &signature);

        Self::do_mint(&env, recipient, token_id, clip_id, metadata_uri, false)?;
        storage::set_nonce_used(&env, nonce);
        Ok(())
    }

    /// Bytes the backend must sign for `mint_with_signature`.
    pub fn mint_authorization_payload(
        env: Env,
        recipient: Address,
        token_id: u64,
        clip_id: String,
        metadata_uri: String,
        nonce: u64,
        expiration: u64,
    ) -> Bytes {
        MintAuthorization {
            contract: env.current_contract_address(),
            recipient,
            token_id,
            clip_id,
            metadata_uri,
            nonce,
            expiration,
        }
        .to_xdr(&env)
    }

    pub fn is_nonce_used(env: Env, nonce: u64) -> bool {
        storage::is_nonce_used(&env, nonce)
    }

    /// Admin: set the per-wallet mint cooldown in seconds (0 disables it).
    pub fn set_mint_cooldown(env: Env, seconds: u64) -> Result<(), Error> {
        let admin = storage::get_admin(&env).ok_or(Error::NotInitialized)?;
        admin.require_auth();
        storage::set_mint_cooldown(&env, seconds);
        Ok(())
    }

    pub fn get_mint_cooldown(env: Env) -> u64 {
        storage::get_mint_cooldown(&env)
    }

    pub fn get_last_mint(env: Env, wallet: Address) -> Option<u64> {
        storage::get_last_mint(&env, &wallet)
    }

    /// Seconds until `wallet` may mint again (0 = allowed now).
    pub fn cooldown_remaining(env: Env, wallet: Address) -> u64 {
        Self::remaining_cooldown(&env, &wallet)
    }

    fn remaining_cooldown(env: &Env, wallet: &Address) -> u64 {
        let cooldown = storage::get_mint_cooldown(env);
        match storage::get_last_mint(env, wallet) {
            Some(last) if cooldown > 0 => {
                let ready = last.saturating_add(cooldown);
                ready.saturating_sub(env.ledger().timestamp())
            }
            _ => 0,
        }
    }

    fn do_mint(
        env: &Env,
        to: Address,
        token_id: u64,
        clip_id: String,
        content_uri: String,
        is_soulbound: bool,
    ) -> Result<(), Error> {
        if storage::has_token(env, token_id) {
            return Err(Error::InvalidTokenId);
        }
        if storage::is_clip_minted(env, &clip_id) {
            return Err(Error::ClipAlreadyMinted);
        }
        if Self::remaining_cooldown(env, &to) > 0 {
            return Err(Error::CooldownActive);
        }

        let created_at = env.ledger().timestamp();
        let token_data = TokenData {
            owner: to.clone(),
            is_soulbound,
            creator: to.clone(),
            clip_id: clip_id.clone(),
            content_uri,
            created_at,
        };

        storage::set_token(env, token_id, &token_data);
        storage::set_owner_token(env, &to, token_id);
        storage::increment_total_supply(env);
        storage::set_clip_minted(env, &clip_id);
        // Only updated after a successful mint.
        storage::set_last_mint(env, &to, created_at);

        events::emit_mint(env, &to, token_id, is_soulbound);
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

        if !storage::is_approved(&env, token_id, &spender)
            && !storage::is_operator(&env, &from, &spender)
            && token_data.owner != spender
        {
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

    /// Approve/unapprove `operator` to transfer all of `owner`'s tokens.
    pub fn set_approval_for_all(
        env: Env,
        owner: Address,
        operator: Address,
        approved: bool,
    ) -> Result<(), Error> {
        owner.require_auth();
        if approved {
            storage::add_operator(&env, &owner, &operator);
        } else {
            storage::remove_operator(&env, &owner, &operator);
        }
        events::emit_approval_update(&env, &owner, Some(operator), None, approved);
        Ok(())
    }

    pub fn is_approved_for_all(env: Env, owner: Address, operator: Address) -> bool {
        storage::is_operator(&env, &owner, &operator)
    }

    /// Revoke the single-token approval on `token_id`. Only the owner may call.
    pub fn revoke_approval(env: Env, owner: Address, token_id: u64) -> Result<(), Error> {
        owner.require_auth();
        let token_data = storage::get_token(&env, token_id).ok_or(Error::TokenNotFound)?;
        if token_data.owner != owner {
            return Err(Error::Unauthorized);
        }
        if storage::get_approval(&env, token_id).is_none() {
            return Err(Error::ApprovalNotFound);
        }
        storage::remove_approval(&env, token_id);
        events::emit_approval_update(&env, &owner, None, Some(token_id), false);
        Ok(())
    }

    /// Revoke every per-token approval and every operator approval of `owner`.
    pub fn revoke_all_approvals(env: Env, owner: Address) -> Result<(), Error> {
        owner.require_auth();
        for token_id in storage::get_owner_tokens(&env, &owner).iter() {
            storage::remove_approval(&env, token_id);
        }
        storage::clear_operators(&env, &owner);
        events::emit_approval_update(&env, &owner, None, None, false);
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

    /// `operator`/`token_id` of `None` with `approved == false` means "all revoked".
    pub fn emit_approval_update(
        env: &Env,
        owner: &Address,
        operator: Option<Address>,
        token_id: Option<u64>,
        approved: bool,
    ) {
        let topics = (Symbol::new(env, "approval_update"), owner.clone());
        env.events().publish(topics, (operator, token_id, approved));
    }
}
