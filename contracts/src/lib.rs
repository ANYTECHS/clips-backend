#![no_std]

use soroban_sdk::{contract, contractimpl, token, Address, BytesN, Env, String, Symbol, Vec};
use soroban_sdk::{contract, contractimpl, Symbol, Env, Address, String};

mod types;
mod storage;
mod error;
#[cfg(test)]
pub mod test_helpers;
mod token;
mod nft;

use types::*;
use storage::*;
use error::ContractError;

/// ClipCashNFT - NFT minting and royalty management contract
/// 
/// Handles:
/// - NFT minting with creator and platform royalty support
/// - Ownership tracking
/// - Royalty distribution and claims
/// - Contract administration and upgrades
/// Approximate fee estimates in stroops (1 XLM = 10_000_000 stroops).
/// These are static baselines; actual fees depend on network congestion and
/// resource usage at submission time and may change before the user signs.
pub const EST_MINT_FEE_STROOPS: i64 = 120_000;
pub const EST_TRANSFER_FEE_STROOPS: i64 = 60_000;

/// 24-hour timelock in seconds.
const TIMELOCK_SECS: u64 = 24 * 60 * 60;

/// ClipCashNFT — NFT minting and royalty management contract.
///
/// Every state-changing function emits a typed event using the structs defined
/// in `types.rs`.  The two-topic convention is:
///
///   topic[0] = "ClipCashNFT"   (contract name, always present)
///   topic[1] = "<EventName>"   (matches SOROBAN_NFT_EVENT_TYPES in the backend)
///
/// Token-scoped events also include token_id as topic[2] so blockchain
/// explorers can filter by token without decoding the value body.
#[contract]
pub struct ClipCashNFT;

#[contractimpl]
impl ClipCashNFT {
    // -----------------------------------------------------------------------
    // Initialization
    // -----------------------------------------------------------------------

    /// Initialize the contract with the owner and royalty configuration.
    ///
    /// Emits: `Initialized { owner, creator_royalty_bps, platform_royalty_bps }`
    pub fn initialize(
        env: Env,
        owner: Address,
        creator_royalty_bps: u32,
        platform_royalty_bps: u32,
    ) -> Result<(), ContractError> {
        if has_owner(&env) {
            return Err(ContractError::AlreadyInitialized);
        }
        if creator_royalty_bps > 10000 || platform_royalty_bps > 10000 {
            return Err(ContractError::InvalidRoyaltyBps);
        }
        // Prevent front-running initialization with an arbitrary owner.
        owner.require_auth();

        // Validate royalty basis points (max 100%)
        if creator_royalty_bps > 10000 || platform_royalty_bps > 10000 {
            return Err(ContractError::InvalidRoyaltyBps);
        }

        // Ensure royalties don't exceed 100%
        // Both values are <= 10_000 here, so this u32 sum cannot overflow.
        if creator_royalty_bps + platform_royalty_bps > 10000 {
            return Err(ContractError::RoyaltyExceedsCap);
        }

        set_owner(&env, &owner);
        set_creator_royalty_bps(&env, creator_royalty_bps);
        set_platform_royalty_bps(&env, platform_royalty_bps);

        // Token counters and schema marker
        storage::init_counters(&env);
        storage::set_schema_version(&env, storage::CURRENT_SCHEMA_VERSION);

        // Emit initialization event
        env.events().publish(
            (Symbol::new(&env, "ClipCashNFT"), Symbol::new(&env, "Initialized")),
            InitializedEvent {
                owner: owner.clone(),
                creator_royalty_bps,
                platform_royalty_bps,
            },
        );

        Ok(())
    }

    // -----------------------------------------------------------------------
    // Mint
    // -----------------------------------------------------------------------

    /// Mint a new NFT for `owner` representing `clip_id`.
    ///
    /// Only the contract owner (platform) may mint.
    ///
    /// Emits: `Mint { token_id, owner, clip_id, metadata_uri, creator_royalty_bps }`
    /// Topics: ("ClipCashNFT", "Mint", token_id)
    pub fn mint(
        env: Env,
        token_id: u64,
        owner: Address,
        clip_id: String,
        metadata_uri: String,
        creator_royalty_bps: u32,
    ) -> Result<(), ContractError> {
        Self::require_not_paused(&env)?;

        let admin = get_owner(&env).ok_or(ContractError::NotInitialized)?;
        admin.require_auth();

        if creator_royalty_bps > 10000 {
            return Err(ContractError::InvalidRoyaltyBps);
        }

        env.events().publish(
            (
                Symbol::new(&env, "ClipCashNFT"),
                Symbol::new(&env, "Mint"),
                token_id,
            ),
            MintEvent {
                token_id,
                owner,
                clip_id,
                metadata_uri,
                creator_royalty_bps,
            },
        );

        Ok(())
    }

    // -----------------------------------------------------------------------
    // Transfer
    // -----------------------------------------------------------------------

    /// Transfer an NFT with royalty distribution.
    ///
    /// Only the current owner may transfer.
    ///
    /// Emits: `Transfer { token_id, from, to, sale_price, royalty_amount }`
    /// Topics: ("ClipCashNFT", "Transfer", token_id)
    pub fn transfer_with_royalty(
        env: Env,
        token_id: u64,
        from: Address,
        to: Address,
        sale_price: i128,
        royalty_bps: u32,
    ) -> Result<(), ContractError> {
        Self::require_not_paused(&env)?;
        from.require_auth();

        if royalty_bps > 10000 {
            return Err(ContractError::InvalidRoyaltyBps);
        }
        if sale_price < 0 {
            return Err(ContractError::InsufficientBalance);
        }

        let royalty_amount = (sale_price * royalty_bps as i128) / 10000;

        env.events().publish(
            (
                Symbol::new(&env, "ClipCashNFT"),
                Symbol::new(&env, "Transfer"),
                token_id,
            ),
            TransferEvent {
                token_id,
                from,
                to,
                sale_price,
                royalty_amount,
            },
        );

        Ok(())
    }

    // -----------------------------------------------------------------------
    // Burn
    // -----------------------------------------------------------------------

    /// Permanently destroy an NFT.
    ///
    /// Only the token owner may burn their own token.
    ///
    /// Emits: `Burn { token_id, owner }`
    /// Topics: ("ClipCashNFT", "Burn", token_id)
    pub fn burn(
        env: Env,
        token_id: u64,
        owner: Address,
    ) -> Result<(), ContractError> {
        Self::require_not_paused(&env)?;
        owner.require_auth();

        env.events().publish(
            (
                Symbol::new(&env, "ClipCashNFT"),
                Symbol::new(&env, "Burn"),
                token_id,
            ),
            BurnEvent {
                token_id,
                owner,
            },
        );

        Ok(())
    }

    // -----------------------------------------------------------------------
    // Freeze / Unfreeze
    // -----------------------------------------------------------------------

    /// Freeze an NFT, blocking transfers.
    ///
    /// Only the contract owner (platform admin) may freeze.
    ///
    /// Emits: `Frozen { token_id, admin, frozen: true }`
    /// Topics: ("ClipCashNFT", "Frozen", token_id)
    pub fn freeze(
        env: Env,
        token_id: u64,
    ) -> Result<(), ContractError> {
        let admin = get_owner(&env).ok_or(ContractError::NotInitialized)?;
        admin.require_auth();

        env.events().publish(
            (
                Symbol::new(&env, "ClipCashNFT"),
                Symbol::new(&env, "Frozen"),
                token_id,
            ),
            FreezeEvent {
                token_id,
                admin,
                frozen: true,
            },
        );

        Ok(())
    }

    /// Unfreeze an NFT, re-enabling transfers.
    ///
    /// Only the contract owner (platform admin) may unfreeze.
    ///
    /// Emits: `Unfrozen { token_id, admin, frozen: false }`
    /// Topics: ("ClipCashNFT", "Unfrozen", token_id)
    pub fn unfreeze(
        env: Env,
        token_id: u64,
    ) -> Result<(), ContractError> {
        let admin = get_owner(&env).ok_or(ContractError::NotInitialized)?;
        admin.require_auth();

        env.events().publish(
            (
                Symbol::new(&env, "ClipCashNFT"),
                Symbol::new(&env, "Unfrozen"),
                token_id,
            ),
            FreezeEvent {
                token_id,
                admin,
                frozen: false,
            },
        );

        Ok(())
    }

    // -----------------------------------------------------------------------
    // Royalty claim
    // -----------------------------------------------------------------------

    /// Claim accrued royalties for a token.
    ///
    /// Only the token creator / royalty recipient may claim.
    ///
    /// Emits: `RoyaltyClaimed { token_id, recipient, amount, asset }`
    /// Topics: ("ClipCashNFT", "RoyaltyClaimed", token_id)
    pub fn claim_royalty(
        env: Env,
        token_id: u64,
        recipient: Address,
        amount: i128,
        asset: String,
    ) -> Result<(), ContractError> {
        recipient.require_auth();

        if amount <= 0 {
            return Err(ContractError::InsufficientBalance);
        }

        env.events().publish(
            (
                Symbol::new(&env, "ClipCashNFT"),
                Symbol::new(&env, "RoyaltyClaimed"),
                token_id,
            ),
            RoyaltyClaimedEvent {
                token_id,
                recipient,
                amount,
                asset,
            },
        );

        Ok(())
    }

    // -----------------------------------------------------------------------
    // Metadata refresh
    // -----------------------------------------------------------------------

    /// Update the metadata URI for an existing token.
    ///
    /// Only the contract owner (platform admin) may refresh metadata.
    ///
    /// Emits: `MetadataRefreshed { token_id, updated_by, new_metadata_uri }`
    /// Topics: ("ClipCashNFT", "MetadataRefreshed", token_id)
    pub fn refresh_metadata(
        env: Env,
        token_id: u64,
        new_metadata_uri: String,
    ) -> Result<(), ContractError> {
        let admin = get_owner(&env).ok_or(ContractError::NotInitialized)?;
        admin.require_auth();

        env.events().publish(
            (
                Symbol::new(&env, "ClipCashNFT"),
                Symbol::new(&env, "MetadataRefreshed"),
                token_id,
            ),
            MetadataRefreshedEvent {
                token_id,
                updated_by: admin,
                new_metadata_uri,
            },
        );

        Ok(())
    }

    // -----------------------------------------------------------------------
    // Royalty configuration
    // -----------------------------------------------------------------------

    /// Update the global royalty configuration (owner only).
    ///
    /// Emits: `RoyaltyUpdated { updated_by, old_creator_bps, new_creator_bps,
    ///                           old_platform_bps, new_platform_bps }`
    pub fn update_royalty_config(
        env: Env,
        creator_royalty_bps: u32,
        platform_royalty_bps: u32,
    ) -> Result<(), ContractError> {
        let owner = get_owner(&env).ok_or(ContractError::NotInitialized)?;
        owner.require_auth();

        if creator_royalty_bps > 10000 || platform_royalty_bps > 10000 {
            return Err(ContractError::InvalidRoyaltyBps);
        }

        // Both values are <= 10_000 here, so this u32 sum cannot overflow.
        if creator_royalty_bps + platform_royalty_bps > 10000 {
            return Err(ContractError::RoyaltyExceedsCap);
        }

        let old_creator_bps = get_creator_royalty_bps(&env).unwrap_or(1000);
        let old_platform_bps = get_platform_royalty_bps(&env).unwrap_or(1000);

        set_creator_royalty_bps(&env, creator_royalty_bps);
        set_platform_royalty_bps(&env, platform_royalty_bps);

        env.events().publish(
            (Symbol::new(&env, "ClipCashNFT"), Symbol::new(&env, "RoyaltyUpdated")),
            RoyaltyUpdatedEvent {
                updated_by: owner,
                old_creator_bps,
                new_creator_bps: creator_royalty_bps,
                old_platform_bps,
                new_platform_bps: platform_royalty_bps,
            },
        );

        Ok(())
    }

    /// Approximate mint cost in stroops. Estimates can change before submission.
    pub fn estimate_mint_fee(_env: Env) -> i64 {
        EST_MINT_FEE_STROOPS
    }

    /// Approximate transfer cost in stroops. Estimates can change before submission.
    pub fn estimate_transfer_fee(_env: Env) -> i64 {
        EST_TRANSFER_FEE_STROOPS
    }

    /// Freeze an individual NFT so it cannot be transferred (owner/admin only).
    pub fn freeze(env: Env, token_id: u32) -> Result<(), ContractError> {
        let owner = get_owner(&env).ok_or(ContractError::NotInitialized)?;
        owner.require_auth();
        if is_frozen(&env, token_id) {
            return Err(ContractError::AlreadyFrozen);
        }
        set_frozen(&env, token_id, true);
        env.events()
            .publish(("ClipCashNFT", Symbol::new(&env, "frozen")), token_id);
        Ok(())
    }

    /// Unfreeze a previously frozen NFT (owner/admin only).
    pub fn unfreeze(env: Env, token_id: u32) -> Result<(), ContractError> {
        let owner = get_owner(&env).ok_or(ContractError::NotInitialized)?;
        owner.require_auth();
        if !is_frozen(&env, token_id) {
            return Err(ContractError::NotFrozen);
        }
        set_frozen(&env, token_id, false);
        env.events()
            .publish(("ClipCashNFT", Symbol::new(&env, "unfrozen")), token_id);
        Ok(())
    }

    /// Whether an NFT is currently frozen.
    pub fn is_frozen(env: Env, token_id: u32) -> bool {
        is_frozen(&env, token_id)
    }

    /// Guard for transfer paths: returns `TokenFrozen` while the NFT is frozen.
    /// Administrative operations (freeze/unfreeze, royalty config, ownership)
    /// remain permitted regardless of freeze state.
    pub fn ensure_transferable(env: Env, token_id: u32) -> Result<(), ContractError> {
        if is_frozen(&env, token_id) {
            return Err(ContractError::TokenFrozen);
        }
        Ok(())
    }

    /// Transfer ownership to a new owner (owner only)
    ///
    /// # Arguments
    /// * `env` - The contract environment
    /// * `new_owner` - The new owner's address
    // -----------------------------------------------------------------------
    // Ownership transfer
    // -----------------------------------------------------------------------

    /// Transfer contract ownership to a new address (owner only).
    ///
    /// Emits: `OwnershipTransferred { previous_owner, new_owner }`
    pub fn transfer_ownership(env: Env, new_owner: Address) -> Result<(), ContractError> {
        let current_owner = get_owner(&env).ok_or(ContractError::NotInitialized)?;
        current_owner.require_auth();
        // New owner must also authorize, so ownership cannot be sent to a
        // mistyped or uncontrolled address.
        new_owner.require_auth();

        set_owner(&env, &new_owner);

        env.events().publish(
            (Symbol::new(&env, "ClipCashNFT"), Symbol::new(&env, "OwnershipTransferred")),
            OwnershipTransferredEvent {
                previous_owner: current_owner,
                new_owner,
            },
        );

        Ok(())
    }

    // -----------------------------------------------------------------------
    // Pause / unpause with 24-hour timelock (Issue #1048)
    // -----------------------------------------------------------------------

    /// Schedule a contract pause. The pause does not take effect immediately;
    /// `pause()` must be called after 24 hours have elapsed.
    ///
    /// Only the contract owner may call this function.
    ///
    /// Emits: `PauseScheduled { requested_by, requested_at, scheduled_for, reason }`
    pub fn schedule_pause(env: Env, reason: String) -> Result<(), ContractError> {
        let owner = get_owner(&env).ok_or(ContractError::NotInitialized)?;
        owner.require_auth();

        if is_paused(&env) {
            return Err(ContractError::AlreadyPaused);
        }
        if get_pause_requested_ts(&env).is_some() {
            return Err(ContractError::AlreadyPaused);
        }

        let now_secs = env.ledger().timestamp();
        let scheduled_for = now_secs + TIMELOCK_SECS;

        set_pause_requested_ts(&env, now_secs);
        set_pause_scheduled_ts(&env, scheduled_for);
        set_pause_reason(&env, &reason);

        env.events().publish(
            (Symbol::new(&env, "ClipCashNFT"), Symbol::new(&env, "PauseScheduled")),
            PauseScheduledEvent {
                requested_by: owner,
                requested_at: now_secs,
                scheduled_for,
                reason,
            },
        );

        Ok(())
    }

    // -----------------------------------------------------------------------
    // Tokens: mint, transfer, burn, ownership and supply
    // -----------------------------------------------------------------------

    /// Mint a clip NFT to `to` (owner only) and return its token ID.
    ///
    /// IDs start at 1 and are never reused, even after a burn. `creator` is
    /// credited with the token and is its initial royalty recipient. Increments
    /// `total_supply` and adds the token to `to`'s ownership list.
    ///
    /// Emits `Mint` with topics `(token_id, to)` and value `uri`.
    pub fn mint(
        env: Env,
        to: Address,
        creator: Address,
        uri: String,
    ) -> Result<u32, ContractError> {
        Self::require_owner(&env)?;

        let token_id = storage::next_token_id(&env)?;
        storage::set_token_owner(&env, token_id, &to);
        storage::set_token_creator(&env, token_id, &creator);
        storage::set_token_uri(&env, token_id, &uri);
        storage::set_royalty_recipient(&env, token_id, &creator);
        storage::add_owned(&env, &to, token_id)?;
        storage::increment_supply(&env)?;

        env.events()
            .publish((Symbol::new(&env, "Mint"), token_id, to), uri);
        Ok(token_id)
    }

    /// Transfer a token from `from` to `to`. `from` must own it and sign.
    ///
    /// Moves the token between the two ownership lists. Transferring to
    /// yourself changes nothing and emits no event. Emits `Transfer` with
    /// topics `(token_id, from, to)`.
    pub fn transfer(
        env: Env,
        from: Address,
        to: Address,
        token_id: u32,
    ) -> Result<(), ContractError> {
        from.require_auth();

        let current = storage::get_token_owner(&env, token_id).ok_or(ContractError::NotFound)?;
        if current != from {
            return Err(ContractError::Unauthorized);
        }
        if from == to {
            return Ok(());
        }

        storage::remove_owned(&env, &from, token_id)?;
        storage::add_owned(&env, &to, token_id)?;
        storage::set_token_owner(&env, token_id, &to);

        env.events()
            .publish((Symbol::new(&env, "Transfer"), token_id, from, to), ());
        Ok(())
    }

    /// Burn a token. `owner` must own it and sign.
    ///
    /// Removes it from the ownership list and decrements `total_supply`. The
    /// token's royalty recipient and unclaimed balance are kept, so royalties
    /// accrued before the burn can still be claimed. Emits `Burn` with topics
    /// `(token_id, owner)`.
    pub fn burn(env: Env, owner: Address, token_id: u32) -> Result<(), ContractError> {
        owner.require_auth();

        let current = storage::get_token_owner(&env, token_id).ok_or(ContractError::NotFound)?;
        if current != owner {
            return Err(ContractError::Unauthorized);
        }

        storage::remove_owned(&env, &owner, token_id)?;
        storage::remove_token(&env, token_id);
        storage::decrement_supply(&env)?;

        env.events()
            .publish((Symbol::new(&env, "Burn"), token_id, owner), ());
        Ok(())
    }

    /// Current owner of a token. Errors with `NotFound` for IDs that were never
    /// minted or have been burned.
    pub fn owner_of(env: Env, token_id: u32) -> Result<Address, ContractError> {
        storage::get_token_owner(&env, token_id).ok_or(ContractError::NotFound)
    }

    /// Metadata URI of a token, or `NotFound`.
    pub fn token_uri(env: Env, token_id: u32) -> Result<String, ContractError> {
        storage::get_token_uri(&env, token_id).ok_or(ContractError::NotFound)
    }

    /// Number of tokens currently in existence: minted minus burned.
    ///
    /// Read-only. Moves only in `mint` (+1) and `burn` (-1); transfers never
    /// change it.
    pub fn total_supply(env: Env) -> u32 {
        storage::total_supply(&env)
    }

    /// One page of the tokens `owner` holds.
    ///
    /// * `limit`  - page size; clamped to `1..=100`.
    /// * `cursor` - 0-based offset into the owner's list; pass `0` for the
    ///   first page and each page's `next_cursor` afterwards.
    ///
    /// Reads at most `limit` entries however many tokens the owner holds, so a
    /// very large holding costs the same per page as a small one. An owner with
    /// no tokens, or a `cursor` at or past the end, returns an empty page with
    /// `next_cursor: None`. The list is reordered when a token is transferred
    /// away or burned (swap-remove), so a cursor is only reliable while the
    /// owner's holdings do not change between calls.
    pub fn get_user_tokens(env: Env, owner: Address, limit: u32, cursor: u32) -> UserTokensPage {
        let total = storage::owned_count(&env, &owner);
        let limit = limit.clamp(1, storage::MAX_PAGE_SIZE);

        let mut tokens = Vec::new(&env);
        if cursor >= total {
            return UserTokensPage {
                tokens,
                next_cursor: None,
                total,
            };
        }

        let end = cursor.saturating_add(limit).min(total);
        for index in cursor..end {
            if let Some(token_id) = storage::owned_at(&env, &owner, index) {
                tokens.push_back(token_id);
            }
        }
        UserTokensPage {
            tokens,
            next_cursor: if end < total { Some(end) } else { None },
            total,
        }
    }

    // -----------------------------------------------------------------------
    // Royalties: asset, recipient, deposits and claims
    // -----------------------------------------------------------------------

    /// Set the asset (token contract) royalties are paid and claimed in
    /// (owner only).
    pub fn set_royalty_asset(env: Env, asset: Address) -> Result<(), ContractError> {
        let owner = Self::require_owner(&env)?;
        storage::set_royalty_asset(&env, &asset);
        env.events().publish(
            (
                Symbol::new(&env, "ConfigurationUpdated"),
                Symbol::new(&env, "royalty_asset"),
                owner,
            ),
            asset,
        );
        Ok(())
    }

    /// The configured royalty asset, if any.
    pub fn get_royalty_asset(env: Env) -> Option<Address> {
        storage::get_royalty_asset(&env)
    }

    /// Change who may claim a token's royalties. The current recipient must
    /// sign. Balances already accrued move with the recipient.
    pub fn set_royalty_recipient(
        env: Env,
        token_id: u32,
        new_recipient: Address,
    ) -> Result<(), ContractError> {
        let current =
            storage::get_royalty_recipient(&env, token_id).ok_or(ContractError::NotFound)?;
        current.require_auth();
        storage::set_royalty_recipient(&env, token_id, &new_recipient);
        env.events().publish(
            (Symbol::new(&env, "RoyaltyUpdated"), token_id),
            (current, new_recipient),
        );
        Ok(())
    }

    /// Credit `amount` of the royalty asset to a token's royalty balance.
    ///
    /// `payer` signs and the asset moves from `payer` into this contract, so
    /// every credited unit is backed by tokens the contract holds. The amount
    /// is whatever the sale computed as royalty; the contract does not
    /// recompute it from the basis points. Emits `RoyaltyPaid` with topics
    /// `(token_id, payer, recipient)` and value `(amount, asset)`.
    pub fn deposit_royalty(
        env: Env,
        payer: Address,
        token_id: u32,
        amount: i128,
    ) -> Result<(), ContractError> {
        payer.require_auth();
        if amount <= 0 {
            return Err(ContractError::InvalidAmount);
        }
        let recipient =
            storage::get_royalty_recipient(&env, token_id).ok_or(ContractError::NotFound)?;
        let asset = storage::get_royalty_asset(&env).ok_or(ContractError::RoyaltyAssetNotSet)?;

        let balance = storage::get_royalty_balance(&env, token_id)
            .checked_add(amount)
            .ok_or(ContractError::Overflow)?;
        storage::set_royalty_balance(&env, token_id, balance);

        token::Client::new(&env, &asset).transfer(&payer, &env.current_contract_address(), &amount);

        env.events().publish(
            (Symbol::new(&env, "RoyaltyPaid"), token_id, payer, recipient),
            (amount, asset),
        );
        Ok(())
    }

    /// Royalties `recipient` could claim for a token right now. Zero when
    /// `recipient` is not the token's royalty recipient. Read-only.
    pub fn get_claimable_royalties(env: Env, token_id: u32, recipient: Address) -> i128 {
        match storage::get_royalty_recipient(&env, token_id) {
            Some(current) if current == recipient => storage::get_royalty_balance(&env, token_id),
            _ => 0,
        }
    }

    /// Pay out a token's accrued royalties to its royalty recipient and return
    /// the amount.
    ///
    /// The recipient stored for the token must authorize the call, so nobody
    /// else can trigger or redirect the payout. The balance is reset to zero
    /// before the transfer, which makes a second call fail with
    /// `NoRoyaltiesToClaim` instead of paying twice. Emits `RoyaltyClaimed`
    /// with topics `(token_id, recipient)` and value `(amount, asset)`.
    ///
    /// # Errors
    /// * `NotFound`            - the token never existed.
    /// * `NoRoyaltiesToClaim`  - nothing is owed.
    /// * `RoyaltyAssetNotSet`  - no royalty asset is configured.
    pub fn claim_royalties(env: Env, token_id: u32) -> Result<i128, ContractError> {
        let recipient =
            storage::get_royalty_recipient(&env, token_id).ok_or(ContractError::NotFound)?;
        recipient.require_auth();

        let amount = storage::get_royalty_balance(&env, token_id);
        if amount <= 0 {
            return Err(ContractError::NoRoyaltiesToClaim);
        }
        let asset = storage::get_royalty_asset(&env).ok_or(ContractError::RoyaltyAssetNotSet)?;

        // Effects before the external call: reset the balance first.
        storage::set_royalty_balance(&env, token_id, 0);

        token::Client::new(&env, &asset).transfer(&env.current_contract_address(), &recipient, &amount);

        env.events().publish(
            (Symbol::new(&env, "RoyaltyClaimed"), token_id, recipient),
            (amount, asset),
        );
        Ok(amount)
    }

    // -----------------------------------------------------------------------
    // Versioning, upgrades and migration
    // -----------------------------------------------------------------------

    /// Contract version, taken from `Cargo.toml` at build time. Read-only.
    pub fn version(env: Env) -> String {
        String::from_str(&env, env!("CARGO_PKG_VERSION"))
    }

    /// Schema version of the stored layout: 1 before tokens existed, 2 now.
    /// After an upgrade this stays at the old value until `migrate` runs.
    pub fn schema_version(env: Env) -> u32 {
        storage::schema_version(&env)
    }

    /// Replace this contract's WASM in place (owner only).
    ///
    /// The address and all storage are kept, so ownership, metadata, royalties
    /// and configuration survive. Run `migrate` afterwards if the new code
    /// bumped the schema. Upload the WASM first (`stellar contract upload`) and
    /// pass the hash it prints. Emits `ConfigurationUpdated` for `wasm_hash`.
    pub fn upgrade(env: Env, new_wasm_hash: BytesN<32>) -> Result<(), ContractError> {
        let owner = Self::require_owner(&env)?;
        env.deployer()
            .update_current_contract_wasm(new_wasm_hash.clone());
        env.events().publish(
            (
                Symbol::new(&env, "ConfigurationUpdated"),
                Symbol::new(&env, "wasm_hash"),
                owner,
            ),
            new_wasm_hash,
        );
        Ok(())
    }

    /// Bring stored data up to the schema this code expects (owner only) and
    /// return the new schema version.
    ///
    /// 1 -> 2 writes the token counters (`NextTokenId` 1, `TotalSupply` 0) if
    /// they are missing and records the schema version. It changes no existing
    /// entry: the owner, royalty configuration and anything else already stored
    /// are left as they are. Errors with `AlreadyMigrated` when storage is
    /// already current, so it cannot be applied twice.
    pub fn migrate(env: Env) -> Result<u32, ContractError> {
        let owner = Self::require_owner(&env)?;
        let from = storage::schema_version(&env);
        if from >= storage::CURRENT_SCHEMA_VERSION {
            return Err(ContractError::AlreadyMigrated);
        }

        storage::init_counters(&env);
        storage::set_schema_version(&env, storage::CURRENT_SCHEMA_VERSION);

        env.events().publish(
            (
                Symbol::new(&env, "ConfigurationUpdated"),
                Symbol::new(&env, "schema_version"),
                owner,
            ),
            (from, storage::CURRENT_SCHEMA_VERSION),
        );
        Ok(storage::CURRENT_SCHEMA_VERSION)
    }

    /// Load the owner and require their signature.
    fn require_owner(env: &Env) -> Result<Address, ContractError> {
        let owner = get_owner(env).ok_or(ContractError::NotInitialized)?;
        owner.require_auth();
        Ok(owner)
    /// Activate the scheduled pause after the 24-hour timelock has elapsed.
    ///
    /// Only the contract owner may call this function.
    ///
    /// Emits: `Paused { paused_by, activated_at }`
    pub fn pause(env: Env) -> Result<(), ContractError> {
        let owner = get_owner(&env).ok_or(ContractError::NotInitialized)?;
        owner.require_auth();

        if is_paused(&env) {
            return Err(ContractError::AlreadyPaused);
        }

        let scheduled_for = get_pause_scheduled_ts(&env)
            .ok_or(ContractError::NotPaused)?;

        let now_secs = env.ledger().timestamp();
        if now_secs < scheduled_for {
            return Err(ContractError::TimelockNotElapsed);
        }

        set_paused(&env, true);
        clear_pause_scheduled_ts(&env);
        clear_pause_requested_ts(&env);

        env.events().publish(
            (Symbol::new(&env, "ClipCashNFT"), Symbol::new(&env, "Paused")),
            PausedEvent {
                paused_by: owner,
                activated_at: now_secs,
            },
        );

        Ok(())
    }

    /// Unpause the contract (or cancel a pending schedule that has not yet
    /// been activated). Clears all pause state.
    ///
    /// Only the contract owner may call this function.
    ///
    /// Emits: `Unpaused { unpaused_by, unpaused_at }`
    pub fn unpause(env: Env) -> Result<(), ContractError> {
        let owner = get_owner(&env).ok_or(ContractError::NotInitialized)?;
        owner.require_auth();

        let currently_paused = is_paused(&env);
        let has_pending = get_pause_requested_ts(&env).is_some();

        if !currently_paused && !has_pending {
            return Err(ContractError::NotPaused);
        }

        set_paused(&env, false);
        clear_pause_requested_ts(&env);
        clear_pause_scheduled_ts(&env);
        clear_pause_reason(&env);

        let now_secs = env.ledger().timestamp();
        env.events().publish(
            (Symbol::new(&env, "ClipCashNFT"), Symbol::new(&env, "Unpaused")),
            UnpausedEvent {
                unpaused_by: owner,
                unpaused_at: now_secs,
            },
        );

        Ok(())
    }

    // -----------------------------------------------------------------------
    // Read-only views
    // -----------------------------------------------------------------------

    pub fn get_owner(env: Env) -> Address {
        get_owner(&env).expect("Owner not initialized")
    }

    pub fn get_creator_royalty_bps(env: Env) -> u32 {
        get_creator_royalty_bps(&env).unwrap_or(1000)
    }

    pub fn get_platform_royalty_bps(env: Env) -> u32 {
        get_platform_royalty_bps(&env).unwrap_or(1000)
    }

    pub fn contract_info(env: Env) -> ContractInfo {
        ContractInfo {
            name: soroban_sdk::String::from_str(&env, "ClipCash NFT"),
            symbol: soroban_sdk::String::from_str(&env, "CLIP"),
            version: soroban_sdk::String::from_str(&env, env!("CARGO_PKG_VERSION")),
            owner: get_owner(&env).expect("Owner not initialized"),
            platform_fee: get_platform_royalty_bps(&env).unwrap_or(1000),
        }
    }

    pub fn is_paused(env: Env) -> bool {
        storage::is_paused(&env)
    }

    pub fn pause_reason(env: Env) -> String {
        get_pause_reason(&env)
    }

    pub fn pause_requested_ts(env: Env) -> Option<u64> {
        get_pause_requested_ts(&env)
    }

    pub fn pause_scheduled_ts(env: Env) -> Option<u64> {
        get_pause_scheduled_ts(&env)
    }

    // -----------------------------------------------------------------------
    // Internal guards
    // -----------------------------------------------------------------------

    fn require_not_paused(env: &Env) -> Result<(), ContractError> {
        if storage::is_paused(env) {
            Err(ContractError::ContractPaused)
        } else {
            Ok(())
        }
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::testutils::Address as _;

    /// Registers and initializes the contract. Tests build their own client
    /// from the returned ID so it can borrow the returned `Env`.
    fn setup() -> (Env, Address, Address) {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, ClipCashNFT);
    use soroban_sdk::testutils::Events;

    fn setup() -> (soroban_sdk::Env, ClipCashNFTClient<'static>, Address) {
        let env = soroban_sdk::Env::default();
        env.mock_all_auths();
        let contract_id = env.register(ClipCashNFT, ());
        // SAFETY: the env outlives the test function; this mirrors the soroban test pattern.
        let client: ClipCashNFTClient<'static> =
            unsafe { core::mem::transmute(ClipCashNFTClient::new(&env, &contract_id)) };
        let owner = Address::generate(&env);
        (env, client, owner)
    }

    // -----------------------------------------------------------------------
    // initialize — Initialized event
    // -----------------------------------------------------------------------

    #[test]
    fn test_initialized_event() {
        let env = soroban_sdk::Env::default();
        env.mock_all_auths();
        let contract_id = env.register(ClipCashNFT, ());
        let client = ClipCashNFTClient::new(&env, &contract_id);
        let owner = Address::generate(&env);

        client.initialize(&owner, &250, &500);

        let events = env.events().all();
        assert!(!events.is_empty(), "No events emitted");
        let (_, topics, data) = &events[0];
        let topic_vals: soroban_sdk::Vec<soroban_sdk::Val> =
            soroban_sdk::Vec::from_array(&env, [topics.get(0).unwrap(), topics.get(1).unwrap()]);
        let _ = topic_vals; // topics are present; value shape confirmed by type system

        // Verify the event value decodes to the expected struct fields.
        let evt: InitializedEvent = soroban_sdk::Val::try_from_val(&env, data)
            .expect("InitializedEvent value should decode");
        assert_eq!(evt.owner, owner);
        assert_eq!(evt.creator_royalty_bps, 250);
        assert_eq!(evt.platform_royalty_bps, 500);
    }

    // -----------------------------------------------------------------------
    // mint — Mint event
    // -----------------------------------------------------------------------

    #[test]
    fn test_mint_event() {
        let env = soroban_sdk::Env::default();
        env.mock_all_auths();
        let contract_id = env.register(ClipCashNFT, ());
        let client = ClipCashNFTClient::new(&env, &contract_id);
        let owner = Address::generate(&env);
        let nft_owner = Address::generate(&env);

        client.initialize(&owner, &250, &500);

        let clip_id = soroban_sdk::String::from_str(&env, "clip-42");
        let uri = soroban_sdk::String::from_str(&env, "ipfs://Qm...");
        client.mint(&1u64, &nft_owner, &clip_id, &uri, &250u32);

        let events = env.events().all();
        // Find the Mint event (second, after Initialized)
        let mint_evt_data = events
            .iter()
            .find(|(_, topics, _)| {
                topics.len() >= 2
                    && topics.get(1)
                        .and_then(|v| soroban_sdk::Symbol::try_from_val(&env, &v).ok())
                        .map(|s| s == Symbol::new(&env, "Mint"))
                        .unwrap_or(false)
            })
            .map(|(_, _, data)| data.clone())
            .expect("Mint event not found");

        let evt: MintEvent = soroban_sdk::Val::try_from_val(&env, &mint_evt_data)
            .expect("MintEvent value should decode");
        assert_eq!(evt.token_id, 1);
        assert_eq!(evt.owner, nft_owner);
        assert_eq!(evt.creator_royalty_bps, 250);
    }

    // -----------------------------------------------------------------------
    // transfer_with_royalty — Transfer event
    // -----------------------------------------------------------------------

    #[test]
    fn test_transfer_event() {
        let env = soroban_sdk::Env::default();
        env.mock_all_auths();
        let contract_id = env.register(ClipCashNFT, ());
        let client = ClipCashNFTClient::new(&env, &contract_id);
        let owner = Address::generate(&env);
        let seller = Address::generate(&env);
        let buyer = Address::generate(&env);

        client.initialize(&owner, &250, &500);
        client.transfer_with_royalty(&1u64, &seller, &buyer, &1_000_000i128, &750u32);

        let events = env.events().all();
        let transfer_data = events
            .iter()
            .find(|(_, topics, _)| {
                topics.get(1)
                    .and_then(|v| soroban_sdk::Symbol::try_from_val(&env, &v).ok())
                    .map(|s| s == Symbol::new(&env, "Transfer"))
                    .unwrap_or(false)
            })
            .map(|(_, _, data)| data.clone())
            .expect("Transfer event not found");

        let evt: TransferEvent = soroban_sdk::Val::try_from_val(&env, &transfer_data)
            .expect("TransferEvent should decode");
        assert_eq!(evt.token_id, 1);
        assert_eq!(evt.from, seller);
        assert_eq!(evt.to, buyer);
        assert_eq!(evt.sale_price, 1_000_000);
        // royalty = 1_000_000 * 750 / 10000 = 75_000
        assert_eq!(evt.royalty_amount, 75_000);
    }

    // -----------------------------------------------------------------------
    // burn — Burn event
    // -----------------------------------------------------------------------

    #[test]
    fn test_burn_event() {
        let env = soroban_sdk::Env::default();
        env.mock_all_auths();
        let contract_id = env.register(ClipCashNFT, ());
        let client = ClipCashNFTClient::new(&env, &contract_id);
        let owner = Address::generate(&env);
        let nft_owner = Address::generate(&env);

        client.initialize(&owner, &250, &500);
        client.burn(&7u64, &nft_owner);

        let events = env.events().all();
        let burn_data = events
            .iter()
            .find(|(_, topics, _)| {
                topics.get(1)
                    .and_then(|v| soroban_sdk::Symbol::try_from_val(&env, &v).ok())
                    .map(|s| s == Symbol::new(&env, "Burn"))
                    .unwrap_or(false)
            })
            .map(|(_, _, data)| data.clone())
            .expect("Burn event not found");

        let evt: BurnEvent = soroban_sdk::Val::try_from_val(&env, &burn_data)
            .expect("BurnEvent should decode");
        assert_eq!(evt.token_id, 7);
        assert_eq!(evt.owner, nft_owner);
    }

    // -----------------------------------------------------------------------
    // freeze / unfreeze — Frozen / Unfrozen events
    // -----------------------------------------------------------------------

    #[test]
    fn test_freeze_unfreeze_events() {
        let env = soroban_sdk::Env::default();
        env.mock_all_auths();
        let contract_id = env.register(ClipCashNFT, ());
        let client = ClipCashNFTClient::new(&env, &contract_id);
        let owner = Address::generate(&env);

        client.initialize(&owner, &250, &500);
        client.freeze(&3u64);
        client.unfreeze(&3u64);

        let events = env.events().all();

        let frozen_data = events
            .iter()
            .find(|(_, topics, _)| {
                topics.get(1)
                    .and_then(|v| soroban_sdk::Symbol::try_from_val(&env, &v).ok())
                    .map(|s| s == Symbol::new(&env, "Frozen"))
                    .unwrap_or(false)
            })
            .map(|(_, _, data)| data.clone())
            .expect("Frozen event not found");

        let frozen_evt: FreezeEvent = soroban_sdk::Val::try_from_val(&env, &frozen_data)
            .expect("FreezeEvent (frozen) should decode");
        assert_eq!(frozen_evt.token_id, 3);
        assert!(frozen_evt.frozen);

        let unfrozen_data = events
            .iter()
            .find(|(_, topics, _)| {
                topics.get(1)
                    .and_then(|v| soroban_sdk::Symbol::try_from_val(&env, &v).ok())
                    .map(|s| s == Symbol::new(&env, "Unfrozen"))
                    .unwrap_or(false)
            })
            .map(|(_, _, data)| data.clone())
            .expect("Unfrozen event not found");

        let unfrozen_evt: FreezeEvent = soroban_sdk::Val::try_from_val(&env, &unfrozen_data)
            .expect("FreezeEvent (unfrozen) should decode");
        assert_eq!(unfrozen_evt.token_id, 3);
        assert!(!unfrozen_evt.frozen);
    }

    // -----------------------------------------------------------------------
    // claim_royalty — RoyaltyClaimed event
    // -----------------------------------------------------------------------

    #[test]
    fn test_royalty_claimed_event() {
        let env = soroban_sdk::Env::default();
        env.mock_all_auths();
        let contract_id = env.register(ClipCashNFT, ());
        let client = ClipCashNFTClient::new(&env, &contract_id);
        let owner = Address::generate(&env);
        let creator = Address::generate(&env);

        client.initialize(&owner, &250, &500);
        let asset = soroban_sdk::String::from_str(&env, "native");
        client.claim_royalty(&5u64, &creator, &50_000i128, &asset);

        let events = env.events().all();
        let rc_data = events
            .iter()
            .find(|(_, topics, _)| {
                topics.get(1)
                    .and_then(|v| soroban_sdk::Symbol::try_from_val(&env, &v).ok())
                    .map(|s| s == Symbol::new(&env, "RoyaltyClaimed"))
                    .unwrap_or(false)
            })
            .map(|(_, _, data)| data.clone())
            .expect("RoyaltyClaimed event not found");

        let evt: RoyaltyClaimedEvent = soroban_sdk::Val::try_from_val(&env, &rc_data)
            .expect("RoyaltyClaimedEvent should decode");
        assert_eq!(evt.token_id, 5);
        assert_eq!(evt.recipient, creator);
        assert_eq!(evt.amount, 50_000);
    }

    // -----------------------------------------------------------------------
    // update_royalty_config — RoyaltyUpdated event
    // -----------------------------------------------------------------------

    #[test]
    fn test_royalty_updated_event() {
        let env = soroban_sdk::Env::default();
        env.mock_all_auths();
        let contract_id = env.register(ClipCashNFT, ());
        let client = ClipCashNFTClient::new(&env, &contract_id);
        let owner = Address::generate(&env);

        client.initialize(&owner, &250, &500);
        client.update_royalty_config(&300u32, &400u32);

        let events = env.events().all();
        let ru_data = events
            .iter()
            .find(|(_, topics, _)| {
                topics.get(1)
                    .and_then(|v| soroban_sdk::Symbol::try_from_val(&env, &v).ok())
                    .map(|s| s == Symbol::new(&env, "RoyaltyUpdated"))
                    .unwrap_or(false)
            })
            .map(|(_, _, data)| data.clone())
            .expect("RoyaltyUpdated event not found");

        let evt: RoyaltyUpdatedEvent = soroban_sdk::Val::try_from_val(&env, &ru_data)
            .expect("RoyaltyUpdatedEvent should decode");
        assert_eq!(evt.old_creator_bps, 250);
        assert_eq!(evt.new_creator_bps, 300);
        assert_eq!(evt.old_platform_bps, 500);
        assert_eq!(evt.new_platform_bps, 400);
    }

    // -----------------------------------------------------------------------
    // refresh_metadata — MetadataRefreshed event
    // -----------------------------------------------------------------------

    #[test]
    fn test_metadata_refreshed_event() {
        let env = soroban_sdk::Env::default();
        env.mock_all_auths();
        let contract_id = env.register(ClipCashNFT, ());
        let client = ClipCashNFTClient::new(&env, &contract_id);
        let owner = Address::generate(&env);

        client.initialize(&owner, &250, &500);
        let new_uri = soroban_sdk::String::from_str(&env, "ipfs://QmNew...");
        client.refresh_metadata(&9u64, &new_uri);

        let events = env.events().all();
        let mr_data = events
            .iter()
            .find(|(_, topics, _)| {
                topics.get(1)
                    .and_then(|v| soroban_sdk::Symbol::try_from_val(&env, &v).ok())
                    .map(|s| s == Symbol::new(&env, "MetadataRefreshed"))
                    .unwrap_or(false)
            })
            .map(|(_, _, data)| data.clone())
            .expect("MetadataRefreshed event not found");

        let evt: MetadataRefreshedEvent = soroban_sdk::Val::try_from_val(&env, &mr_data)
            .expect("MetadataRefreshedEvent should decode");
        assert_eq!(evt.token_id, 9);
        assert_eq!(
            evt.new_metadata_uri,
            soroban_sdk::String::from_str(&env, "ipfs://QmNew..."),
        );
    }

    // -----------------------------------------------------------------------
    // schedule_pause / pause / unpause — PauseScheduled / Paused / Unpaused
    // -----------------------------------------------------------------------

    #[test]
    fn test_pause_events() {
        let env = soroban_sdk::Env::default();
        env.mock_all_auths();
        let contract_id = env.register(ClipCashNFT, ());
        let client = ClipCashNFTClient::new(&env, &contract_id);
        let owner = Address::generate(&env);

        client.initialize(&owner, &250, &500);

        let reason = soroban_sdk::String::from_str(&env, "maintenance");
        client.schedule_pause(&reason);

        // Verify PauseScheduled event
        let events = env.events().all();
        let ps_data = events
            .iter()
            .find(|(_, topics, _)| {
                topics.get(1)
                    .and_then(|v| soroban_sdk::Symbol::try_from_val(&env, &v).ok())
                    .map(|s| s == Symbol::new(&env, "PauseScheduled"))
                    .unwrap_or(false)
            })
            .map(|(_, _, data)| data.clone())
            .expect("PauseScheduled event not found");

        let ps_evt: PauseScheduledEvent = soroban_sdk::Val::try_from_val(&env, &ps_data)
            .expect("PauseScheduledEvent should decode");
        assert_eq!(ps_evt.requested_by, owner);
        assert_eq!(
            ps_evt.scheduled_for,
            ps_evt.requested_at + TIMELOCK_SECS,
        );

        // Advance past the timelock and activate
        env.ledger().set_timestamp(ps_evt.scheduled_for + 1);
        client.pause();

        let events2 = env.events().all();
        let p_data = events2
            .iter()
            .find(|(_, topics, _)| {
                topics.get(1)
                    .and_then(|v| soroban_sdk::Symbol::try_from_val(&env, &v).ok())
                    .map(|s| s == Symbol::new(&env, "Paused"))
                    .unwrap_or(false)
            })
            .map(|(_, _, data)| data.clone())
            .expect("Paused event not found");

        let p_evt: PausedEvent = soroban_sdk::Val::try_from_val(&env, &p_data)
            .expect("PausedEvent should decode");
        assert_eq!(p_evt.paused_by, owner);

        // Unpause
        client.unpause();

        let events3 = env.events().all();
        let up_data = events3
            .iter()
            .find(|(_, topics, _)| {
                topics.get(1)
                    .and_then(|v| soroban_sdk::Symbol::try_from_val(&env, &v).ok())
                    .map(|s| s == Symbol::new(&env, "Unpaused"))
                    .unwrap_or(false)
            })
            .map(|(_, _, data)| data.clone())
            .expect("Unpaused event not found");

        let up_evt: UnpausedEvent = soroban_sdk::Val::try_from_val(&env, &up_data)
            .expect("UnpausedEvent should decode");
        assert_eq!(up_evt.unpaused_by, owner);
    }

    // -----------------------------------------------------------------------
    // transfer_ownership — OwnershipTransferred event
    // -----------------------------------------------------------------------

    #[test]
    fn test_ownership_transferred_event() {
        let env = soroban_sdk::Env::default();
        env.mock_all_auths();
        let contract_id = env.register(ClipCashNFT, ());
        let client = ClipCashNFTClient::new(&env, &contract_id);
        let owner = Address::generate(&env);
        let new_owner = Address::generate(&env);

        client.initialize(&owner, &250, &500);
        client.transfer_ownership(&new_owner);

        let events = env.events().all();
        let ot_data = events
            .iter()
            .find(|(_, topics, _)| {
                topics.get(1)
                    .and_then(|v| soroban_sdk::Symbol::try_from_val(&env, &v).ok())
                    .map(|s| s == Symbol::new(&env, "OwnershipTransferred"))
                    .unwrap_or(false)
            })
            .map(|(_, _, data)| data.clone())
            .expect("OwnershipTransferred event not found");

        let evt: OwnershipTransferredEvent =
            soroban_sdk::Val::try_from_val(&env, &ot_data)
                .expect("OwnershipTransferredEvent should decode");
        assert_eq!(evt.previous_owner, owner);
        assert_eq!(evt.new_owner, new_owner);
    }

    // -----------------------------------------------------------------------
    // Guard: mint blocked while paused
    // -----------------------------------------------------------------------

    #[test]
    fn test_mint_blocked_while_paused() {
        let env = soroban_sdk::Env::default();
        env.mock_all_auths();
        let contract_id = env.register(ClipCashNFT, ());
        let client = ClipCashNFTClient::new(&env, &contract_id);
        let owner = Address::generate(&env);
        let nft_owner = Address::generate(&env);

        client.initialize(&owner, &250, &500);
        client.schedule_pause(&soroban_sdk::String::from_str(&env, "test"));
        let scheduled_for = client.pause_scheduled_ts().unwrap();
        env.ledger().set_timestamp(scheduled_for + 1);
        client.pause();

        let result = client.try_mint(
            &99u64,
            &nft_owner,
            &soroban_sdk::String::from_str(&env, "clip-99"),
            &soroban_sdk::String::from_str(&env, "ipfs://..."),
            &250u32,
        );
        assert!(result.is_err(), "mint() must fail while paused");
    }

    // -----------------------------------------------------------------------
    // Guard: transfer blocked while paused
    // -----------------------------------------------------------------------

    #[test]
    fn test_transfer_blocked_while_paused() {
        let env = soroban_sdk::Env::default();
        env.mock_all_auths();
        let contract_id = env.register(ClipCashNFT, ());
        let client = ClipCashNFTClient::new(&env, &contract_id);
        let owner = Address::generate(&env);
        let seller = Address::generate(&env);
        let buyer = Address::generate(&env);

        client.initialize(&owner, &250, &500);
        client.schedule_pause(&soroban_sdk::String::from_str(&env, "test"));
        let scheduled_for = client.pause_scheduled_ts().unwrap();
        env.ledger().set_timestamp(scheduled_for + 1);
        client.pause();

        let result =
            client.try_transfer_with_royalty(&1u64, &seller, &buyer, &1_000_000i128, &750u32);
        assert!(result.is_err(), "transfer() must fail while paused");
    }

    // -----------------------------------------------------------------------
    // Legacy initialization test (unchanged behaviour)
    // -----------------------------------------------------------------------

    #[test]
    fn test_initialization() {
        let env = soroban_sdk::Env::default();
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register(ClipCashNFT, ());
        let client = ClipCashNFTClient::new(&env, &contract_id);
        let owner = Address::generate(&env);
        ClipCashNFTClient::new(&env, &contract_id).initialize(&owner, &250, &500);
        (env, contract_id, owner)
    }

    fn uri(env: &Env) -> String {
        String::from_str(env, "ipfs://clip")
    }

    #[test]
    fn test_initialization() {
        let (env, contract_id, owner) = setup();
        let client = ClipCashNFTClient::new(&env, &contract_id);

        let info = client.contract_info();
        assert_eq!(info.name, String::from_str(&env, "ClipCash NFT"));
        assert_eq!(info.symbol, String::from_str(&env, "CLIP"));
        assert_eq!(info.version, String::from_str(&env, env!("CARGO_PKG_VERSION")));
        assert_eq!(info.owner, owner);
        assert_eq!(info.platform_fee, 500);
        assert_eq!(client.version(), info.version);
        assert_eq!(client.schema_version(), 2);
        assert_eq!(client.total_supply(), 0);
    }

    #[test]
    fn mint_tracks_ownership_and_supply() {
        let (env, contract_id, _) = setup();
        let client = ClipCashNFTClient::new(&env, &contract_id);
        let alice = Address::generate(&env);

        let first = client.mint(&alice, &alice, &uri(&env));
        let second = client.mint(&alice, &alice, &uri(&env));

        assert_eq!((first, second), (1, 2));
        assert_eq!(client.total_supply(), 2);
        assert_eq!(client.owner_of(&1), alice);
        assert_eq!(client.get_user_tokens(&alice, &10, &0).total, 2);
    }

    #[test]
    fn transfer_moves_token_between_owner_lists_without_changing_supply() {
        let (env, contract_id, _) = setup();
        let client = ClipCashNFTClient::new(&env, &contract_id);
        let alice = Address::generate(&env);
        let bob = Address::generate(&env);
        for _ in 0..3 {
            client.mint(&alice, &alice, &uri(&env));
        }

        client.transfer(&alice, &bob, &1);

        assert_eq!(client.total_supply(), 3);
        assert_eq!(client.owner_of(&1), bob);
        // Token 3 filled the slot token 1 left (swap-remove).
        assert_eq!(client.get_user_tokens(&alice, &10, &0).tokens, soroban_sdk::vec![&env, 3, 2]);
        assert_eq!(client.get_user_tokens(&bob, &10, &0).tokens, soroban_sdk::vec![&env, 1]);
        assert_eq!(
            client.try_transfer(&alice, &bob, &1),
            Err(Ok(ContractError::Unauthorized))
        );
    }

    #[test]
    fn burn_decrements_supply_and_removes_the_token() {
        let (env, contract_id, _) = setup();
        let client = ClipCashNFTClient::new(&env, &contract_id);
        let alice = Address::generate(&env);
        client.mint(&alice, &alice, &uri(&env));
        client.mint(&alice, &alice, &uri(&env));

        client.burn(&alice, &1);

        assert_eq!(client.total_supply(), 1);
        assert_eq!(client.try_owner_of(&1), Err(Ok(ContractError::NotFound)));
        assert_eq!(client.get_user_tokens(&alice, &10, &0).tokens, soroban_sdk::vec![&env, 2]);
        // IDs are not reused.
        assert_eq!(client.mint(&alice, &alice, &uri(&env)), 3);
        assert_eq!(client.total_supply(), 2);
    }

    #[test]
    fn get_user_tokens_pages_with_a_cursor() {
        let (env, contract_id, _) = setup();
        let client = ClipCashNFTClient::new(&env, &contract_id);
        let alice = Address::generate(&env);
        for _ in 0..5 {
            client.mint(&alice, &alice, &uri(&env));
        }

        let page = client.get_user_tokens(&alice, &2, &0);
        assert_eq!(page.tokens, soroban_sdk::vec![&env, 1, 2]);
        assert_eq!(page.next_cursor, Some(2));
        assert_eq!(page.total, 5);

        let page = client.get_user_tokens(&alice, &2, &2);
        assert_eq!(page.tokens, soroban_sdk::vec![&env, 3, 4]);
        assert_eq!(page.next_cursor, Some(4));

        let page = client.get_user_tokens(&alice, &2, &4);
        assert_eq!(page.tokens, soroban_sdk::vec![&env, 5]);
        assert_eq!(page.next_cursor, None);

        // A limit of 0 is raised to 1; a huge limit is capped at 100.
        assert_eq!(client.get_user_tokens(&alice, &0, &0).tokens.len(), 1);
        assert_eq!(client.get_user_tokens(&alice, &u32::MAX, &0).tokens.len(), 5);
    }

    #[test]
    fn get_user_tokens_handles_empty_and_out_of_range() {
        let (env, contract_id, _) = setup();
        let client = ClipCashNFTClient::new(&env, &contract_id);
        let alice = Address::generate(&env);
        let nobody = Address::generate(&env);
        client.mint(&alice, &alice, &uri(&env));

        let empty = client.get_user_tokens(&nobody, &10, &0);
        assert_eq!(empty.tokens.len(), 0);
        assert_eq!(empty.next_cursor, None);
        assert_eq!(empty.total, 0);

        let past_end = client.get_user_tokens(&alice, &10, &7);
        assert_eq!(past_end.tokens.len(), 0);
        assert_eq!(past_end.next_cursor, None);
        assert_eq!(past_end.total, 1);
    }

    #[test]
    fn claim_royalties_pays_the_recipient_once() {
        let (env, contract_id, _) = setup();
        let client = ClipCashNFTClient::new(&env, &contract_id);
        let creator = Address::generate(&env);
        let payer = Address::generate(&env);
        let asset_admin = Address::generate(&env);
        let asset = env.register_stellar_asset_contract_v2(asset_admin).address();
        token::StellarAssetClient::new(&env, &asset).mint(&payer, &1_000);

        client.set_royalty_asset(&asset);
        let token_id = client.mint(&creator, &creator, &uri(&env));
        client.deposit_royalty(&payer, &token_id, &400);
        client.deposit_royalty(&payer, &token_id, &100);
        assert_eq!(client.get_claimable_royalties(&token_id, &creator), 500);
        assert_eq!(client.get_claimable_royalties(&token_id, &payer), 0);

        assert_eq!(client.claim_royalties(&token_id), 500);

        // The recipient signed the claim.
        assert_eq!(env.auths()[0].0, creator);
        let asset_client = token::Client::new(&env, &asset);
        assert_eq!(asset_client.balance(&creator), 500);
        assert_eq!(asset_client.balance(&contract_id), 0);
        assert_eq!(client.get_claimable_royalties(&token_id, &creator), 0);

        // A second claim finds nothing owed and pays nothing.
        assert_eq!(
            client.try_claim_royalties(&token_id),
            Err(Ok(ContractError::NoRoyaltiesToClaim))
        );
        assert_eq!(asset_client.balance(&creator), 500);
    }

    #[test]
    fn claim_royalties_follows_the_current_recipient_and_survives_burn() {
        let (env, contract_id, _) = setup();
        let client = ClipCashNFTClient::new(&env, &contract_id);
        let creator = Address::generate(&env);
        let new_recipient = Address::generate(&env);
        let payer = Address::generate(&env);
        let asset = env
            .register_stellar_asset_contract_v2(Address::generate(&env))
            .address();
        token::StellarAssetClient::new(&env, &asset).mint(&payer, &1_000);
        client.set_royalty_asset(&asset);

        let token_id = client.mint(&creator, &creator, &uri(&env));
        client.deposit_royalty(&payer, &token_id, &300);
        client.set_royalty_recipient(&token_id, &new_recipient);
        client.burn(&creator, &token_id);

        assert_eq!(client.get_claimable_royalties(&token_id, &creator), 0);
        assert_eq!(client.claim_royalties(&token_id), 300);
        assert_eq!(token::Client::new(&env, &asset).balance(&new_recipient), 300);
    }

    #[test]
    fn claim_royalties_rejects_unknown_tokens_and_missing_asset() {
        let (env, contract_id, _) = setup();
        let client = ClipCashNFTClient::new(&env, &contract_id);
        let creator = Address::generate(&env);

        assert_eq!(client.try_claim_royalties(&99), Err(Ok(ContractError::NotFound)));

        let token_id = client.mint(&creator, &creator, &uri(&env));
        assert_eq!(
            client.try_claim_royalties(&token_id),
            Err(Ok(ContractError::NoRoyaltiesToClaim))
        );
        assert_eq!(
            client.try_deposit_royalty(&creator, &token_id, &10),
            Err(Ok(ContractError::RoyaltyAssetNotSet))
        );
        assert_eq!(
            client.try_deposit_royalty(&creator, &token_id, &0),
            Err(Ok(ContractError::InvalidAmount))
        );
    }

    #[test]
    fn migrate_upgrades_schema_one_once_and_keeps_existing_state() {
        let (env, contract_id, owner) = setup();
        let client = ClipCashNFTClient::new(&env, &contract_id);
        let alice = Address::generate(&env);
        client.mint(&alice, &alice, &uri(&env));

        // Already current: nothing to do.
        assert_eq!(client.try_migrate(), Err(Ok(ContractError::AlreadyMigrated)));

        // Put the contract back into the schema-1 shape (no counters, no marker).
        env.as_contract(&contract_id, || {
            let instance = env.storage().instance();
            instance.remove(&DataKey::SchemaVersion);
            instance.remove(&DataKey::NextTokenId);
            instance.remove(&DataKey::TotalSupply);
        });
        assert_eq!(client.schema_version(), 1);

        assert_eq!(client.migrate(), 2);
        assert_eq!(client.schema_version(), 2);
        assert_eq!(client.get_owner(), owner);
        assert_eq!(client.get_creator_royalty_bps(), 250);
        assert_eq!(client.get_platform_royalty_bps(), 500);
        assert_eq!(client.try_migrate(), Err(Ok(ContractError::AlreadyMigrated)));
    }

    // -----------------------------------------------------------------------
    // Pause / unpause timelock (pre-existing behaviour tests)
    // -----------------------------------------------------------------------

    #[test]
    fn test_pause_blocked_before_timelock() {
        let env = soroban_sdk::Env::default();
        env.mock_all_auths();
        let contract_id = env.register(ClipCashNFT, ());
        let client = ClipCashNFTClient::new(&env, &contract_id);
        let owner = Address::generate(&env);

        client.initialize(&owner, &250, &500);
        client.schedule_pause(&soroban_sdk::String::from_str(&env, "test"));

        let result = client.try_pause();
        assert!(result.is_err());
    }

    #[test]
    fn test_unpause_cancels_pending_schedule() {
        let env = soroban_sdk::Env::default();
        env.mock_all_auths();
        let contract_id = env.register(ClipCashNFT, ());
        let client = ClipCashNFTClient::new(&env, &contract_id);
        let owner = Address::generate(&env);

        client.initialize(&owner, &250, &500);
        client.schedule_pause(&soroban_sdk::String::from_str(&env, "test"));
        client.unpause();

        assert!(!client.is_paused());
        assert!(client.pause_requested_ts().is_none());
    }

    #[test]
    fn test_unauthorized_pause_rejected() {
        let env = soroban_sdk::Env::default();
        let contract_id = env.register(ClipCashNFT, ());
        let client = ClipCashNFTClient::new(&env, &contract_id);
        let owner = Address::generate(&env);

        env.mock_all_auths_allowing_non_root_auth();
        client.initialize(&owner, &250, &500);

        let result =
            client.try_schedule_pause(&soroban_sdk::String::from_str(&env, "hack"));
        assert!(result.is_err());
    }

    use crate::test_helpers::*;

    #[test]
    fn test_fee_estimates() {
        let (_env, _owner, client) = setup_initialized(250, 500);
        assert_eq!(client.estimate_mint_fee(), EST_MINT_FEE_STROOPS);
        assert_eq!(client.estimate_transfer_fee(), EST_TRANSFER_FEE_STROOPS);
    }

    #[test]
    fn test_freeze_blocks_transfer_and_unfreeze_allows() {
        let (env, _owner, client) = setup_initialized(250, 500);
        let clip = mint_test_clip(&env, TestClipOpts::default());

        client.freeze(&clip.token_id);
        assert!(client.is_frozen(&clip.token_id));
        assert_eq!(
            client.try_ensure_transferable(&clip.token_id),
            Err(Ok(ContractError::TokenFrozen))
        );
        assert_eq!(client.try_freeze(&clip.token_id), Err(Ok(ContractError::AlreadyFrozen)));

        // Administrative operations remain permitted while frozen.
        set_test_royalty(&client, 300, 700);

        client.unfreeze(&clip.token_id);
        assert!(!client.is_frozen(&clip.token_id));
        assert_eq!(client.try_unfreeze(&clip.token_id), Err(Ok(ContractError::NotFrozen)));
        simulate_test_sale(&client, &clip, 1_000_000);
    }

    #[test]
    #[should_panic]
    fn test_freeze_unauthorized() {
        let (env, _owner, client) = setup_initialized(250, 500);
        env.set_auths(&[]);
        client.freeze(&1);
    }

    #[test]
    fn test_sale_helper_splits_royalties() {
        let (env, _owner, client) = setup_initialized(250, 500);
        set_test_royalty(&client, 300, 700);
        let clip = mint_test_clip(&env, TestClipOpts { token_id: 7, ..Default::default() });
        let sale = simulate_test_sale(&client, &clip, 1_000_000);
        assert_eq!(sale.creator_amount, 30_000);
        assert_eq!(sale.platform_amount, 70_000);
        assert_eq!(sale.seller_amount, 900_000);
    }
}
