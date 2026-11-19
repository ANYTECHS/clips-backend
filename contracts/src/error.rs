use soroban_sdk::contracterror;

/// ClipCashNFT contract errors
#[contracterror]
#[derive(Copy, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub enum ContractError {
    NotInitialized = 1,
    AlreadyInitialized = 2,
    InvalidRoyaltyBps = 3,
    RoyaltyExceedsCap = 4,
    Unauthorized = 5,
    NotFound = 6,
    AlreadyExists = 7,
    InsufficientBalance = 8,
    /// Mint or transfer attempted while the contract is paused.
    ContractPaused = 9,
    /// pause() called when a pause is already active or pending.
    AlreadyPaused = 10,
    /// unpause() called when the contract is not currently paused.
    NotPaused = 11,
    /// pause() invoked before the 24-hour timelock has elapsed.
    TimelockNotElapsed = 12,
}

impl core::fmt::Display for ContractError {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        match self {
            ContractError::NotInitialized => write!(f, "Contract not initialized"),
            ContractError::AlreadyInitialized => write!(f, "Contract already initialized"),
            ContractError::InvalidRoyaltyBps => write!(f, "Invalid royalty basis points"),
            ContractError::RoyaltyExceedsCap => write!(f, "Royalties exceed 100%"),
            ContractError::Unauthorized => write!(f, "Unauthorized"),
            ContractError::NotFound => write!(f, "Not found"),
            ContractError::AlreadyExists => write!(f, "Already exists"),
            ContractError::InsufficientBalance => write!(f, "Insufficient balance"),
            ContractError::ContractPaused => write!(f, "Contract is paused"),
            ContractError::AlreadyPaused => write!(f, "Contract is already paused"),
            ContractError::NotPaused => write!(f, "Contract is not paused"),
            ContractError::TimelockNotElapsed => write!(f, "24-hour timelock has not elapsed"),
        }
    }
}
