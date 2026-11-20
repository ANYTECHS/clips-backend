#![no_std]

use soroban_sdk::{contract, contractimpl, Symbol, Env, Address, storage::Persistent};

mod types;
mod storage;
mod error;
#[cfg(test)]
pub mod test_helpers;

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

#[contract]
pub struct ClipCashNFT;

#[contractimpl]
impl ClipCashNFT {
    /// Initialize the contract with the owner and royalty configuration
    ///
    /// # Arguments
    /// * `env` - The contract environment
    /// * `owner` - The admin address (typically the platform)
    /// * `creator_royalty_bps` - Creator royalty in basis points (0-10000)
    /// * `platform_royalty_bps` - Platform royalty in basis points (0-10000)
    ///
    /// # Returns
    /// `Result<(), ContractError>` - Success or error
    pub fn initialize(
        env: Env,
        owner: Address,
        creator_royalty_bps: u32,
        platform_royalty_bps: u32,
    ) -> Result<(), ContractError> {
        // Check if already initialized
        if has_owner(&env) {
            return Err(ContractError::AlreadyInitialized);
        }

        // Validate royalty basis points (max 100%)
        if creator_royalty_bps > 10000 || platform_royalty_bps > 10000 {
            return Err(ContractError::InvalidRoyaltyBps);
        }

        // Ensure royalties don't exceed 100%
        if creator_royalty_bps + platform_royalty_bps > 10000 {
            return Err(ContractError::RoyaltyExceedsCap);
        }

        // Store owner
        set_owner(&env, &owner);

        // Store royalty configuration
        set_creator_royalty_bps(&env, creator_royalty_bps);
        set_platform_royalty_bps(&env, platform_royalty_bps);

        // Emit initialization event
        env.events().publish(
            ("ClipCashNFT", Symbol::new(&env, "initialized")),
            (
                owner.clone(),
                creator_royalty_bps,
                platform_royalty_bps,
            ),
        );

        Ok(())
    }

    /// Get the current contract owner
    ///
    /// # Arguments
    /// * `env` - The contract environment
    ///
    /// # Returns
    /// The owner's address
    pub fn get_owner(env: Env) -> Address {
        get_owner(&env).expect("Owner not initialized")
    }

    /// Get the creator royalty in basis points
    ///
    /// # Arguments
    /// * `env` - The contract environment
    ///
    /// # Returns
    /// Creator royalty in basis points (0-10000)
    pub fn get_creator_royalty_bps(env: Env) -> u32 {
        get_creator_royalty_bps(&env).unwrap_or(1000) // Default 10%
    }

    /// Get the platform royalty in basis points
    ///
    /// # Arguments
    /// * `env` - The contract environment
    ///
    /// # Returns
    /// Platform royalty in basis points (0-10000)
    pub fn get_platform_royalty_bps(env: Env) -> u32 {
        get_platform_royalty_bps(&env).unwrap_or(1000) // Default 10%
    }

    /// Return the contract's public metadata and current platform fee.
    ///
    /// `platform_fee` is reported in basis points and uses the platform
    /// royalty configuration already stored by `initialize`.
    pub fn contract_info(env: Env) -> ContractInfo {
        ContractInfo {
            name: soroban_sdk::String::from_str(&env, "ClipCash NFT"),
            symbol: soroban_sdk::String::from_str(&env, "CLIP"),
            version: soroban_sdk::String::from_str(&env, env!("CARGO_PKG_VERSION")),
            owner: get_owner(&env).expect("Owner not initialized"),
            platform_fee: get_platform_royalty_bps(&env).unwrap_or(1000),
        }
    }

    /// Update royalty configuration (owner only)
    ///
    /// # Arguments
    /// * `env` - The contract environment
    /// * `creator_royalty_bps` - New creator royalty in basis points
    /// * `platform_royalty_bps` - New platform royalty in basis points
    ///
    /// # Returns
    /// `Result<(), ContractError>` - Success or error
    pub fn update_royalty_config(
        env: Env,
        creator_royalty_bps: u32,
        platform_royalty_bps: u32,
    ) -> Result<(), ContractError> {
        let owner = get_owner(&env).ok_or(ContractError::NotInitialized)?;
        owner.require_auth();

        // Validate new royalty basis points
        if creator_royalty_bps > 10000 || platform_royalty_bps > 10000 {
            return Err(ContractError::InvalidRoyaltyBps);
        }

        if creator_royalty_bps + platform_royalty_bps > 10000 {
            return Err(ContractError::RoyaltyExceedsCap);
        }

        // Update configuration
        set_creator_royalty_bps(&env, creator_royalty_bps);
        set_platform_royalty_bps(&env, platform_royalty_bps);

        // Emit update event
        env.events().publish(
            ("ClipCashNFT", Symbol::new(&env, "royalty_config_updated")),
            (creator_royalty_bps, platform_royalty_bps),
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
    ///
    /// # Returns
    /// `Result<(), ContractError>` - Success or error
    pub fn transfer_ownership(env: Env, new_owner: Address) -> Result<(), ContractError> {
        let current_owner = get_owner(&env).ok_or(ContractError::NotInitialized)?;
        current_owner.require_auth();

        // Update owner
        set_owner(&env, &new_owner);

        // Emit ownership transfer event
        env.events().publish(
            ("ClipCashNFT", Symbol::new(&env, "ownership_transferred")),
            (current_owner, new_owner),
        );

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_initialization() {
        let env = Env::default();
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
