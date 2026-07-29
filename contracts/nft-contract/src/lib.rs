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
    /// Initialise the contract and set the admin address.
    ///
    /// # Security
    /// `admin.require_auth()` is called **before** writing to storage so that
    /// only the holder of `admin`'s private key can claim the admin role.
    /// This prevents a frontrunning attack where an observer of the deploy
    /// transaction races to call `initialize` with a malicious admin address.
    pub fn initialize(env: Env, admin: Address) -> Result<(), Error> {
        if storage::has_admin(&env) {
            return Err(Error::AlreadyInitialized);
        }
        // AC-01 fix: require admin to authorise its own appointment.
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

    /// Transfer an NFT with **automatic royalty enforcement** on secondary sales.
    ///
    /// # Royalty calculation
    ///
    /// ```text
    /// royalty_amount = sale_price * royalty_bps / 10_000
    /// ```
    ///
    /// The applicable royalty rate is resolved in this order:
    ///   1. Per-token royalty (if one was stored when the token was minted)
    ///   2. Contract-level default royalty
    ///   3. Zero (0 BPS) — free transfer, no event emitted
    ///
    /// When `royalty_amount > 0` the contract records the royalty obligation
    /// and emits a `royalty_paid` event.  Actual XLM settlement is handled
    /// off-chain by the backend (see `POST /nfts/prepare-transfer`).
    ///
    /// # Soulbound tokens
    ///
    /// Soulbound tokens cannot be transferred; this function returns
    /// `Error::SoulboundTokenNotTransferable` for them.
    ///
    /// # Parameters
    ///
    /// * `from`       — Current owner (must authorize the call)
    /// * `to`         — New owner after the transfer
    /// * `token_id`   — Token being transferred
    /// * `sale_price` — Agreed sale price in stroops (or any common unit).
    ///                  Pass `0` for gifted/free transfers.
    ///
    /// # Returns
    ///
    /// `RoyaltyInfo` struct with `recipient`, `royalty_amount`, and
    /// `royalty_bps` so the caller can verify what was recorded.
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

        // ── 1. Resolve applicable royalty rate ──────────────────────────────
        // Per-token rate takes precedence over the contract-level default.
        let royalty_bps: u32 = storage::get_token_royalty_bps(&env, token_id)
            .or_else(|| storage::get_default_royalty_bps(&env))
            .unwrap_or(0);

        // ── 2. Calculate royalty amount ─────────────────────────────────────
        // Integer division; fractional stroops are truncated (rounded down).
        let royalty_amount: u64 = if royalty_bps == 0 || sale_price == 0 {
            0
        } else {
            sale_price * (royalty_bps as u64) / 10_000
        };

        // ── 3. Royalty recipient is the original creator ────────────────────
        let recipient = token_data.creator.clone();

        // ── 4. Execute the transfer ─────────────────────────────────────────
        storage::remove_owner_token(&env, &from, token_id);
        storage::set_owner_token(&env, &to, token_id);

        let mut updated_token = token_data;
        updated_token.owner = to.clone();
        storage::set_token(&env, token_id, &updated_token);

        // ── 5. Emit standard transfer event ────────────────────────────────
        events::emit_transfer(&env, &from, &to, token_id);

        // ── 6. Emit RoyaltyPaid event (only when royalty is non-zero) ───────
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

    /// Record a royalty payment for a secondary-market sale.
    ///
    /// This is a **notification-only** entry point: it verifies the token
    /// exists and emits a `RoyaltyPaid` event so that frontends and indexers
    /// can track royalty flows.  Actual fund movement (XLM / token transfer
    /// to the creator) is the responsibility of the marketplace contract.
    ///
    /// # Parameters
    /// * `token_id`      – The NFT for which the royalty is being paid.
    /// * `payer`         – The account settling the royalty (authorisation
    ///                     required to prevent event spam).
    /// * `amount_stroops`– The royalty amount in stroops (1 XLM = 10 000 000).
    ///
    /// # Errors
    /// * `Error::TokenNotFound` – `token_id` does not exist.
    pub fn pay_royalty(
        env: Env,
        token_id: u64,
        payer: Address,
        amount_stroops: u64,
    ) -> Result<(), Error> {
        // Require the payer to authorise the call so that third parties
        // cannot forge royalty-paid events on behalf of others.
        payer.require_auth();

        let token_data =
            storage::get_token(&env, token_id).ok_or(Error::TokenNotFound)?;

        events::emit_royalty_paid(
            &env,
            token_id,
            &payer,
            &token_data.creator,
            amount_stroops,
        );
        Ok(())
    }
    /// Set a per-token royalty BPS, overriding the contract-level default for
    /// this specific token.  Only the contract admin may call this.
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

    /// Return the per-token royalty BPS for a specific token, or `None` if
    /// no per-token override is set (contract default applies).
    pub fn get_token_royalty_bps(env: Env, token_id: u64) -> Option<u32> {
        storage::get_token_royalty_bps(&env, token_id)
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

    /// EV-01: emitted whenever the default royalty BPS is changed.
    /// `old_bps` is 0 when no royalty was previously configured.
    pub fn emit_royalty_updated(env: &Env, old_bps: u32, new_bps: u32) {
        let topics = (Symbol::new(env, "royalty_updated"),);
        env.events().publish(topics, (old_bps, new_bps));
    }

    /// Emitted by `pay_royalty` whenever a secondary-sale royalty is recorded.
    ///
    /// Topics (indexed):  `("royalty_paid", token_id, payer)`
    /// Data:              `(creator, amount_stroops)`
    pub fn emit_royalty_paid(
        env: &Env,
        token_id: u64,
        payer: &Address,
        creator: &Address,
        amount_stroops: u64,
    ) {
        let topics = (
            Symbol::new(env, "royalty_paid"),
            token_id,
            payer.clone(),
        );
        env.events().publish(topics, (creator.clone(), amount_stroops));
    /// Emitted by `transfer_with_royalty` whenever a non-zero royalty is due.
    ///
    /// Topics: `("royalty_paid", recipient)`
    /// Data:   `(token_id, royalty_amount, royalty_bps, sale_price)`
    pub fn emit_royalty_paid(
        env: &Env,
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

    /// **View-only** — returns the current owner of `token_id`, or `None` if the
    /// token has not been minted.
    ///
    /// # Notes
    /// This function performs no state mutation and requires no authorisation.
    /// Callers should invoke it via simulation (i.e. `simulateTransaction`) to
    /// avoid unnecessary fees.
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

    /// **View-only** — returns the number of NFTs currently held by `owner`.
    ///
    /// Returns `0` for any address that owns no tokens (including addresses
    /// that have never interacted with the contract).
    ///
    /// # Notes
    /// This function performs no state mutation and requires no authorisation.
    pub fn balance_of(env: Env, owner: Address) -> u64 {
        storage::get_owner_tokens(&env, &owner).len() as u64
    }

    /// **View-only** — returns the content URI stored for `token_id`, or `None`
    /// if the token does not exist.
    ///
    /// The URI is set at mint time via the `content_uri` field and is immutable
    /// thereafter. It typically points to an IPFS CID or an HTTPS metadata
    /// endpoint, following the ERC-721 `tokenURI` convention.
    ///
    /// # Notes
    /// This function performs no state mutation and requires no authorisation.
    pub fn token_uri(env: Env, token_id: u64) -> Option<String> {
        storage::get_token(&env, token_id).map(|t| t.content_uri)
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

        // EV-01 fix: capture old value before overwrite so the event carries both.
        let old_bps = storage::get_default_royalty_bps(&env).unwrap_or(0);
        storage::set_default_royalty_bps(&env, bps);
        events::emit_royalty_updated(&env, old_bps, bps);
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
    /// EV-01: emitted whenever the default royalty BPS is changed.
    /// `old_bps` is 0 when no royalty was previously configured.
    pub fn emit_royalty_updated(env: &Env, old_bps: u32, new_bps: u32) {
        let topics = (Symbol::new(env, "royalty_updated"),);
        env.events().publish(topics, (old_bps, new_bps));
    }
}
