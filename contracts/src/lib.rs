#![no_std]

use soroban_sdk::{contract, contractimpl, Symbol, Env, Address, storage::Persistent};

mod types;
mod storage;
mod error;

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
        // Test will be implemented with Soroban test framework
        // See tests/integration_test.rs for full test suite
    }
}
