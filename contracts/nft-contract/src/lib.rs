#![no_std]
use soroban_sdk::{
    contract, contracterror, contractimpl, contractmeta, contracttype,
    token, Address, BytesN, Env, Map, String, Symbol, Val, Vec,
    token, Address, BytesN, Env, Map, String, Symbol, Vec,
};
use soroban_token_sdk::metadata::TokenMetadata;

mod admin;
mod metadata;
mod storage;

#[cfg(test)]
mod test;

pub use admin::Admin;
pub use metadata::ClipMetadata;
pub use storage::{get_token_metadata, set_token_metadata, ROYALTY_BPS_MAX};

const CLIP_NAME: &[u8] = b"ClipCash NFT";
const CLIP_SYMBOL: &[u8] = b"CLIP";
pub const MAX_BATCH_SIZE: u32 = 50;

/// Semantic version of this contract build (Issue #692).
///
/// Follows semver (`MAJOR.MINOR.PATCH`):
/// - `PATCH` — bug fixes with no interface changes (e.g. this overflow fix).
/// - `MINOR` — new functions or fields added in a backwards-compatible way.
/// - `MAJOR` — a breaking change to an existing function's signature,
///   behavior, or storage layout.
///
/// Bump this constant (and the `contractmeta!` value below, which must stay
/// in sync) in the same PR that introduces the change it describes. Query it
/// on-chain via the `version()` view function, or off-chain by reading the
/// `version` contract metadata entry without invoking the contract.
pub const VERSION: &str = "1.1.0";

contractmeta!(key = "name", val = "ClipCash NFT Contract");
contractmeta!(key = "version", val = "1.1.0");

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
    InvalidWasmHash = 19,
    /// Clip signature verification failed — caller is not the clip owner.
    InvalidSignature = 20,
    InvalidWasmHash = 10,
    /// Clip signature verification failed — caller is not the clip owner.
    InvalidSignature = 11,
    /// Nonce is stale — replay attack detected.
    InvalidNonce = 12,
    /// Clip hash was not pre-verified by the admin.
    ClipNotVerified = 13,
    /// Array lengths do not match for batch operation.
    ArrayLengthMismatch = 14,
    /// Batch size is 0 or exceeds maximum allowable limit.
    InvalidBatchSize = 15,
    /// One-time metadata update limit reached for token ID.
    MetadataAlreadyUpdated = 16,
    /// `sale_price * royalty_bps` would overflow the arithmetic type used
    /// for the calculation. See the safe-limits table on each royalty
    /// function for the maximum `sale_price` that avoids this.
    RoyaltyOverflow = 17,
    MetadataAlreadyUpdated = 14,
    /// withdraw_xlm called before initiate_withdraw (Issue #676).
    WithdrawNotInitiated = 15,
    /// withdraw_xlm called before the 24-hour timelock has elapsed (Issue #676).
    WithdrawTimelockActive = 16,
    /// withdraw_xlm amount must be greater than zero (Issue #676).
    InvalidWithdrawAmount = 17,
    /// XLM token SAC address has not been configured (Issue #676).
    XlmTokenNotConfigured = 18,
    /// No royalties have accrued yet — nothing to claim.
    InsufficientBalance = 21,
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

    /// Return the semantic version of the deployed contract (Issue #692).
    ///
    /// Public read-only call, no auth required. Reflects the `VERSION`
    /// constant baked into this WASM build — distinct from
    /// `get_contract_version`/`set_contract_version`, which is an
    /// admin-settable runtime value used for external deployment tracking
    /// and can drift from what's actually running.
    pub fn version(env: Env) -> String {
        String::from_str(&env, VERSION)
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

    /// Calculate the royalty amount owed on `sale_price` at `royalty_bps`
    /// basis points (Issue #680). Reusable helper shared by
    /// `transfer_with_royalty` and callers estimating a royalty ahead of a
    /// sale, so the math is defined in exactly one place instead of being
    /// duplicated across transfer and payout flows.
    ///
    /// Rounding: truncates toward zero (integer division) — any fractional
    /// stroop is rounded down. The multiplication is done in `u128` so it
    /// cannot overflow even at `sale_price == u64::MAX`.
    ///
    /// Returns `0` when `sale_price` is `0`, `royalty_bps` is `0`, or
    /// `royalty_bps` exceeds `storage::ROYALTY_BPS_MAX` (10 000 = 100%).
    pub fn calculate_royalty(_env: Env, sale_price: u64, royalty_bps: u32) -> u64 {
        if sale_price == 0 || royalty_bps == 0 || royalty_bps > storage::ROYALTY_BPS_MAX {
            return 0;
        }
        ((sale_price as u128) * (royalty_bps as u128) / (storage::ROYALTY_BPS_MAX as u128)) as u64
    }

    /// Calculate fractional royalty for assets with custom decimal precision (Issue #685).
    ///
    /// Uses checked arithmetic (Issue #689): `sale_price * royalty_bps` is
    /// computed with `checked_mul` and returns `Error::RoyaltyOverflow`
    /// instead of panicking if the product would overflow `u128`. Since
    /// `royalty_bps` is capped at `ROYALTY_BPS_MAX` (10 000), overflow can
    /// only occur for `sale_price > u128::MAX / 10_000`
    /// (~3.4 * 10^34), a value with no realistic on-chain meaning.
    pub fn calculate_fractional_royalty(
        _env: Env,
        sale_price: u128,
        royalty_bps: u32,
        _asset_decimals: u32,
    ) -> Result<u128, Error> {
        if royalty_bps == 0 || sale_price == 0 {
            return Ok(0);
        }
        if royalty_bps > storage::ROYALTY_BPS_MAX {
            return Err(Error::InvalidRoyaltyBps);
        }

        let product = sale_price
            .checked_mul(royalty_bps as u128)
            .ok_or(Error::RoyaltyOverflow)?;
        Ok(product / (storage::ROYALTY_BPS_MAX as u128))
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

        let royalty_amount: u64 = Self::calculate_royalty(env.clone(), sale_price, royalty_bps);
        // Checked arithmetic (Issue #689): `royalty_bps` is capped at
        // ROYALTY_BPS_MAX (10 000), so `sale_price * royalty_bps` only
        // overflows `u64` for `sale_price > u64::MAX / 10_000`
        // (~1.84 * 10^15 stroops, i.e. ~184 million XLM at 7 decimals).
        let royalty_amount: u64 = if royalty_bps == 0 || sale_price == 0 {
            0
        } else {
            sale_price
                .checked_mul(royalty_bps as u64)
                .ok_or(Error::RoyaltyOverflow)?
                / (storage::ROYALTY_BPS_MAX as u64)
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

        // Allow the transfer if spender is:
        //   1. the token owner itself,
        //   2. approved for this specific token, or
        //   3. an approved-for-all operator for `from` (Issue #675)
        let is_authorised = token_data.owner == spender
            || storage::is_approved(&env, token_id, &spender)
            || storage::is_approved_for_all(&env, &from, &spender);

        if !is_authorised {
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

    /// Grant or revoke operator approval for all tokens (Issue #675).
    ///
    /// When `approved` is `true`, `operator` is allowed to call
    /// `transfer_from` on any token owned by `owner`, matching ERC-721's
    /// `setApprovalForAll` semantics.  Set `approved` to `false` to revoke.
    ///
    /// `owner.require_auth()` is enforced — only the owner may change their
    /// own operator list.
    pub fn set_approval_for_all(
        env: Env,
        owner: Address,
        operator: Address,
        approved: bool,
    ) -> Result<(), Error> {
        owner.require_auth();

        if storage::is_paused(&env) {
            return Err(Error::ContractPaused);
        }

        storage::set_approval_for_all(&env, &owner, &operator, approved);
        events::emit_approval_for_all(&env, &owner, &operator, approved);
        Ok(())
    }

    /// Return whether `operator` is approved to manage all tokens owned by
    /// `owner` (Issue #675).
    pub fn is_approved_for_all(env: Env, owner: Address, operator: Address) -> bool {
        storage::is_approved_for_all(&env, &owner, &operator)
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

    /// Return the original ClipCash backend clip ID stored at mint time (Issue #674).
    ///
    /// Every NFT records the database Clip ID that was passed to `mint()` or
    /// `batch_mint()`. This creates a verifiable on-chain link between the NFT
    /// and the ClipCash database record, enabling ownership and royalty checks
    /// that cross the Web2/Web3 boundary.
    ///
    /// Returns `None` when the token does not exist.
    pub fn get_clip_id(env: Env, token_id: u64) -> Option<String> {
        storage::get_token(&env, token_id).map(|t| t.clip_id)
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
    pub fn pay_royalty_with_asset(
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
        // Checked arithmetic (Issue #689): previously used `saturating_mul`,
        // which silently clamps to `i128::MAX` on overflow and would pay out
        // a nonsensical royalty amount instead of failing. `checked_mul`
        // rejects the call outright via `Error::RoyaltyOverflow`.
        let royalty_amount = amount
            .checked_mul(bps as i128)
            .ok_or(Error::RoyaltyOverflow)?
            / (ROYALTY_BPS_MAX as i128);

        if royalty_amount > 0 {
            let asset_client = token::Client::new(&env, &asset);
            asset_client.transfer(&payer, &token_data.creator, &royalty_amount);
        }

        events::emit_royalty_paid_asset(&env, &payer, &token_data.creator, &asset, token_id, royalty_amount);
        Ok(royalty_amount)
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

    /// Record a royalty payment made off-chain (in stroops) for `token_id`,
    /// emitting a `royalty_paid` event for indexers.
    /// Record the royalty payment owed on `token_id`. Emits `royalty_paid`
    /// with the amount in stroops. `payer` must authorize the call.
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

    // ── Issue #676: Emergency withdraw for stuck XLM ────────────────────────

    /// Initiate a 24-hour timelock before XLM can be withdrawn (Issue #676).
    ///
    /// The admin calls this first to start the clock. After 24 hours have
    /// passed, `withdraw_xlm` can be executed. This two-step design prevents
    /// accidental or malicious instant drains.
    ///
    /// Only the contract admin may call this function.
    pub fn initiate_withdraw(env: Env) -> Result<u64, Error> {
        let admin = storage::get_admin(&env).ok_or(Error::NotInitialized)?;
        admin.require_auth();

        let unlock_time = env.ledger().timestamp() + storage::WITHDRAW_TIMELOCK_SECS;
        storage::set_withdraw_unlock_time(&env, unlock_time);

        events::emit_withdraw_initiated(&env, &admin, unlock_time);
        Ok(unlock_time)
    }

    /// Return the timestamp (Unix seconds) when a pending withdraw becomes
    /// executable, or `None` when no initiation is pending (Issue #676).
    pub fn get_withdraw_unlock_time(env: Env) -> Option<u64> {
        storage::get_withdraw_unlock_time(&env)
    }

    /// Withdraw accidentally-stuck XLM to `recipient` (Issue #676).
    ///
    /// Requirements:
    ///   - Caller must be the contract admin.
    ///   - `initiate_withdraw()` must have been called at least 24 hours ago.
    ///   - `amount_stroops` must be > 0.
    ///
    /// On success the timelock is cleared and a `withdraw_xlm` event is
    /// emitted so the transaction is auditable on-chain.
    pub fn withdraw_xlm(
        env: Env,
        recipient: Address,
        amount_stroops: i128,
    ) -> Result<(), Error> {
        let admin = storage::get_admin(&env).ok_or(Error::NotInitialized)?;
        admin.require_auth();

        if amount_stroops <= 0 {
            return Err(Error::InvalidWithdrawAmount);
        }

        let unlock_time = storage::get_withdraw_unlock_time(&env)
            .ok_or(Error::WithdrawNotInitiated)?;

        if env.ledger().timestamp() < unlock_time {
            return Err(Error::WithdrawTimelockActive);
        }

        // Clear timelock before transferring (checks-effects-interactions).
        storage::clear_withdraw_unlock_time(&env);

        // Transfer native XLM from the contract's own balance to recipient.
        let xlm_token_address = storage::get_xlm_token_address(&env)
            .ok_or(Error::XlmTokenNotConfigured)?;
        let token_client = token::Client::new(&env, &xlm_token_address);
        token_client.transfer(
            &env.current_contract_address(),
            &recipient,
            &amount_stroops,
        );

        events::emit_withdraw_xlm(&env, &admin, &recipient, amount_stroops);
        Ok(())
    }

    /// Set the XLM Stellar Asset Contract (SAC) address used by
    /// `withdraw_xlm`. Only the admin may call this (Issue #676).
    pub fn set_xlm_token_address(env: Env, xlm_token: Address) -> Result<(), Error> {
        let admin = storage::get_admin(&env).ok_or(Error::NotInitialized)?;
        admin.require_auth();
        storage::set_xlm_token_address(&env, &xlm_token);
        Ok(())
    }

    /// Return a paginated slice of token IDs owned by `owner`.
    ///
    /// `limit`  – maximum number of token IDs to return (capped at 100).
    /// `cursor` – offset into the owner's token list (0-based index).
    ///
    /// Returns an empty Vec when `cursor` >= total tokens or `limit` is 0.
    pub fn get_user_tokens(env: Env, owner: Address, limit: u32, cursor: u32) -> Vec<u64> {
        let tokens = storage::get_owner_tokens(&env, &owner);
        let total = tokens.len();
        let start = cursor.min(total);
        let effective_limit = limit.min(100);
        let end = (start + effective_limit).min(total);
        let mut result = Vec::new(&env);
        let mut i = start;
        while i < end {
            result.push_back(tokens.get(i).unwrap());
            i += 1;
        }
        result
    }

    /// Accumulate royalties for a token.  Called after each royalty payment so
    /// that the owed balance grows until the creator calls `claim_royalties`.
    ///
    /// Only the contract admin may call this — it is invoked internally by
    /// off-chain infra that tracks on-chain `royalty_paid` events and credits
    /// the per-token ledger.
    pub fn accrue_royalties(
        env: Env,
        token_id: u64,
        amount: i128,
    ) -> Result<(), Error> {
        let admin = storage::get_admin(&env).ok_or(Error::NotInitialized)?;
        admin.require_auth();

        if !storage::has_token(&env, token_id) {
            return Err(Error::TokenNotFound);
        }

        storage::add_accumulated_royalty(&env, token_id, amount);
        Ok(())
    }

    /// Return the claimable royalty balance for a token.
    pub fn get_claimable_royalties(env: Env, token_id: u64) -> Result<i128, Error> {
        if !storage::has_token(&env, token_id) {
            return Err(Error::TokenNotFound);
        }
        Ok(storage::get_accumulated_royalty(&env, token_id))
    }

    /// Claim all accumulated royalties for `token_id`.
    ///
    /// Only the token's royalty recipient (creator by default) may call this.
    /// Transfers the full claimable balance via the SAC `asset`, resets the
    /// on-chain balance to zero, and emits `RoyaltyClaimed`.
    ///
    /// Returns `Error::InsufficientBalance` when there is nothing to claim.
    pub fn claim_royalties(
        env: Env,
        token_id: u64,
        asset: Address,
    ) -> Result<i128, Error> {
        if !storage::is_supported_asset(&env, &asset) {
            return Err(Error::UnsupportedAsset);
        }

        let token_data = storage::get_token(&env, token_id).ok_or(Error::TokenNotFound)?;

        // Only the current royalty recipient (or creator as fallback) may claim.
        let recipient = Self::get_royalty_recipient(env.clone(), token_id)
            .unwrap_or_else(|| token_data.creator.clone());

        recipient.require_auth();

        let claimable = storage::get_accumulated_royalty(&env, token_id);
        if claimable <= 0 {
            return Err(Error::InsufficientBalance);
        }

        // Transfer accumulated amount to recipient via SAC.
        let contract_address = env.current_contract_address();
        let asset_client = token::Client::new(&env, &asset);
        asset_client.transfer(&contract_address, &recipient, &claimable);

        // Reset balance — prevents double claims.
        storage::reset_accumulated_royalty(&env, token_id);

        events::emit_royalty_claimed(&env, &recipient, token_id, claimable, &asset);

        Ok(claimable)
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

    /// Emitted when an owner grants or revokes operator-level approval for
    /// all their tokens (Issue #675 — `set_approval_for_all`).
    pub fn emit_approval_for_all(
        env: &Env,
        owner: &Address,
        operator: &Address,
        approved: bool,
    ) {
        let topics = (
            Symbol::new(env, "approval_all"),
            owner.clone(),
            operator.clone(),
        );
        env.events().publish(topics, approved);
    }

    pub fn emit_paused(env: &Env, admin: &Address) {
        let topics = (Symbol::new(env, "paused"), admin.clone());
        env.events().publish(topics, ());
    }

    pub fn emit_unpaused(env: &Env, admin: &Address) {
        let topics = (Symbol::new(env, "unpaused"), admin.clone());
        env.events().publish(topics, ());
    }

    pub fn emit_burn(env: &Env, owner: &Address, token_id: u64) {
        let topics = (Symbol::new(env, "burn"), owner.clone());
        env.events().publish(topics, token_id);
    }

    pub fn emit_royalties_updated(env: &Env, token_id: u64, total_bps: u32) {
        let topics = (Symbol::new(env, "royalties_updated"), token_id);
        env.events().publish(topics, total_bps);
    }

    pub fn emit_royalty_updated(env: &Env, old_bps: u32, new_bps: u32) {
        let topics = (Symbol::new(env, "royalty_updated"),);
        env.events().publish(topics, (old_bps, new_bps));
    }

    /// Emitted by `pay_royalty_with_asset` when a royalty is paid out in a
    /// specific Stellar asset contract (SAC).
    pub fn emit_royalty_paid_asset(
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

    /// Emitted by `transfer_with_royalty` and `pay_royalty` when a royalty
    /// amount (in stroops) is computed/paid for a token sale.
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

    pub fn emit_upgrade(env: &Env, new_wasm_hash: &BytesN<32>) {
        let topics = (Symbol::new(env, "upgrade"),);
        env.events().publish(topics, (new_wasm_hash.clone(),));
    }

    /// Emitted when the admin calls `initiate_withdraw()` (Issue #676).
    /// `unlock_time` is the Unix timestamp after which `withdraw_xlm` may run.
    pub fn emit_withdraw_initiated(env: &Env, admin: &Address, unlock_time: u64) {
        let topics = (Symbol::new(env, "withdraw_init"), admin.clone());
        env.events().publish(topics, unlock_time);
    }

    /// Emitted on a successful `withdraw_xlm()` execution (Issue #676).
    pub fn emit_withdraw_xlm(
        env: &Env,
        admin: &Address,
        recipient: &Address,
        amount_stroops: i128,
    ) {
        let topics = (
            Symbol::new(env, "withdraw_xlm"),
            admin.clone(),
            recipient.clone(),
        );
        env.events().publish(topics, amount_stroops);
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

    /// Emitted when a creator successfully claims their accumulated royalties.
    ///
    /// Topics:  `["royalty_claimed", recipient: Address]`
    /// Data:    `(token_id: u64, amount: i128, asset: Address)`
    pub fn emit_royalty_claimed(
        env: &Env,
        recipient: &Address,
        token_id: u64,
        amount: i128,
        asset: &Address,
    ) {
        let topics = (Symbol::new(env, "royalty_claimed"), recipient.clone());
        env.events().publish(topics, (token_id, amount, asset.clone()));
    }
}
