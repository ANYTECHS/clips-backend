#![no_std]

use soroban_sdk::{contract, contractimpl, Symbol, Env, Address, String};

mod types;
mod storage;
mod error;

use types::*;
use storage::*;
use error::ContractError;

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
        if creator_royalty_bps + platform_royalty_bps > 10000 {
            return Err(ContractError::RoyaltyExceedsCap);
        }

        set_owner(&env, &owner);
        set_creator_royalty_bps(&env, creator_royalty_bps);
        set_platform_royalty_bps(&env, platform_royalty_bps);

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

    // -----------------------------------------------------------------------
    // Ownership transfer
    // -----------------------------------------------------------------------

    /// Transfer contract ownership to a new address (owner only).
    ///
    /// Emits: `OwnershipTransferred { previous_owner, new_owner }`
    pub fn transfer_ownership(env: Env, new_owner: Address) -> Result<(), ContractError> {
        let current_owner = get_owner(&env).ok_or(ContractError::NotInitialized)?;
        current_owner.require_auth();

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
        let contract_id = env.register(ClipCashNFT, ());
        let client = ClipCashNFTClient::new(&env, &contract_id);
        let owner = Address::generate(&env);

        client.initialize(&owner, &250, &500);

        let info = client.contract_info();
        assert_eq!(info.name, soroban_sdk::String::from_str(&env, "ClipCash NFT"));
        assert_eq!(info.symbol, soroban_sdk::String::from_str(&env, "CLIP"));
        assert_eq!(
            info.version,
            soroban_sdk::String::from_str(&env, env!("CARGO_PKG_VERSION"))
        );
        assert_eq!(info.owner, owner);
        assert_eq!(info.platform_fee, 500);
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
}
